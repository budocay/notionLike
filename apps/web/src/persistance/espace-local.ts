import type * as Y from "yjs";

import { estUuidCanonique } from "../identifiants/uuid-canonique.ts";
import { type Ouverture, ouvrirSousEcheance, type Persistance } from "./indexeddb.ts";
import { espaceDeLaBase, nomDeBase } from "./nom-de-base.ts";
import { creerLesMagasinsManquants } from "./reparation.ts";

// Base de l'appareil : ce n'est pas une base de document (ADR-0008). Elle naît à la version 1 avec
// son magasin ; la version 2 est celle d'une base réparée, à laquelle le magasin manquait
// (F-030-AC24). Au-delà, l'application ne la connaît pas : elle ne l'abaisse ni ne la supprime.
const BASE_APPAREIL = "notionlike:appareil";
const VERSION_D_UNE_BASE_NEUVE = 1;
const VERSION_LA_PLUS_HAUTE_CONNUE = 2;
const MAGASIN_REGLAGES = "reglages";
const CLE_ESPACE_LOCAL = "espace-local";

/** Persistance du document de l'espace local, qui sait quel espace l'appareil a retenu. */
export interface PersistanceEspaceLocal extends Persistance {
  /**
   * Identifiant de l'espace local retenu sur l'appareil, tel que la fonction de nommage l'a
   * contrôlé ; `undefined` tant qu'aucune tentative ne l'a lu ni inscrit (F-003-AC25).
   */
  idEspace(): string | undefined;
}

// À chaque tentative, l'identifiant est relu, et au besoin inscrit, avec le candidat de l'ouverture
// et aucun autre (F-030-AC9). Il n'est rendu qu'après être entré dans le nom de sa base.
export function ouvrirEspaceLocal(doc: Y.Doc, idCandidat: string): PersistanceEspaceLocal {
  nomDeLEspace(idCandidat);
  let idRetenu: string | undefined;
  const persistance = ouvrirSousEcheance(doc, (ouverture) =>
    retenirLEspace(idCandidat, ouverture, (idEspace) => {
      const nom = nomDeLEspace(idEspace);
      idRetenu = idEspace;
      ouverture.relire(nom);
    }),
  );
  return { ...persistance, idEspace: () => idRetenu };
}

function nomDeLEspace(idEspace: string): string {
  return nomDeBase({ type: "espace", idEspace });
}

// Ce que l'appareil a conservé peut être illisible : un nom de base n'en est jamais tiré sans que
// la fonction de forme l'ait admis (F-002-AC28).
function estUnIdentifiant(valeur: unknown): valeur is string {
  return typeof valeur === "string" && estUuidCanonique(valeur);
}

function retenirLEspace(
  idCandidat: string,
  ouverture: Ouverture,
  poursuivre: (idEspace: string) => void,
): void {
  ouvrirLaBaseDeLAppareil(ouverture, (connexion) => {
    // Seule l'absence de valeur dans une base à sa première version vaut premier lancement. Une
    // valeur nulle est illisible, et l'absence de valeur dans une base réparée aussi : « réparée »
    // se lit sur la version de la base, que la montée vienne de cette tentative ou d'une tentative
    // interrompue avant l'inscription (F-030-AC24).
    const reparee = connexion.version > VERSION_D_UNE_BASE_NEUVE;
    const remplacable = (valeur: unknown): boolean => valeur === undefined && !reparee;
    lireOuInscrire({ connexion, ouverture, idAInscrire: idCandidat, remplacable }, (valeur) => {
      if (estUnIdentifiant(valeur)) {
        poursuivre(valeur);
      } else {
        remplacerLaValeurIllisible(idCandidat, ouverture, poursuivre);
      }
    });
  });
}

// La valeur illisible ne porte rien d'utilisable : elle est remplacée, sans qu'aucune base de
// document soit lue, renommée ni fusionnée. Une seule base d'espace sur l'appareil : c'est celle
// de l'utilisateur. Aucune : le candidat. Plusieurs, ou énumération impossible : rien ne dit
// laquelle est la bonne, le candidat est inscrit et les autres restent intactes (F-030-AC23).
function remplacerLaValeurIllisible(
  idCandidat: string,
  ouverture: Ouverture,
  poursuivre: (idEspace: string) => void,
): void {
  enumererLesEspaces((espaces) => {
    if (!ouverture.attendue()) {
      return;
    }
    const [seul] = espaces ?? [];
    const idAInscrire = espaces?.length === 1 && seul !== undefined ? seul : idCandidat;
    if (espaces === undefined || espaces.length > 1) {
      ouverture.signalerDesBasesNonRattachees();
    }
    ouvrirLaBaseDeLAppareil(ouverture, (connexion) => {
      // La valeur est relue dans la transaction qui l'écrit, et n'est remplacée que si elle est
      // encore illisible : deux onglets lancés ensemble retiennent le même identifiant.
      const remplacable = (valeur: unknown): boolean => !estUnIdentifiant(valeur);
      lireOuInscrire({ connexion, ouverture, idAInscrire, remplacable }, (valeur) => {
        if (estUnIdentifiant(valeur)) {
          poursuivre(valeur);
        } else {
          ouverture.echouer();
        }
      });
    });
  });
}

/** Identifiants des espaces qui ont une base sur l'appareil ; `undefined` si rien ne le dit. */
function enumererLesEspaces(conclure: (espaces: readonly string[] | undefined) => void): void {
  if (typeof indexedDB.databases !== "function") {
    conclure(undefined);
    return;
  }
  let enumeration: Promise<IDBDatabaseInfo[]>;
  try {
    enumeration = indexedDB.databases();
  } catch {
    conclure(undefined);
    return;
  }
  enumeration.then(
    (bases) => {
      const espaces = bases.map((base) => espaceDeLaBase(base.name ?? ""));
      conclure(espaces.filter((idEspace) => idEspace !== undefined));
    },
    () => conclure(undefined),
  );
}

interface Inscription {
  readonly connexion: IDBDatabase;
  readonly ouverture: Ouverture;
  readonly idAInscrire: string;
  /** Vrai si la valeur relue doit céder la place à l'identifiant à inscrire. */
  readonly remplacable: (valeur: unknown) => boolean;
}

// Lecture et inscription dans une seule transaction en écriture : IndexedDB sérialise celles d'un
// même magasin, deux onglets lancés ensemble retiennent donc le même identifiant (F-002-AC4). La
// connexion n'est tenue que le temps de cette transaction. `poursuivre` reçoit ce que le magasin
// porte quand elle finit.
function lireOuInscrire(inscription: Inscription, poursuivre: (valeur: unknown) => void): void {
  const { connexion, ouverture, idAInscrire, remplacable } = inscription;
  let transaction: IDBTransaction;
  try {
    transaction = connexion.transaction(MAGASIN_REGLAGES, "readwrite");
  } catch {
    connexion.close();
    ouverture.echouer();
    return;
  }
  const reglages = transaction.objectStore(MAGASIN_REGLAGES);
  const lecture = reglages.get(CLE_ESPACE_LOCAL);
  let retenue: unknown;
  lecture.onsuccess = () => {
    retenue = lecture.result;
    // L'échéance peut tomber entre l'ouverture et cette lecture : rien n'est inscrit après elle
    // (F-002-AC24).
    if (remplacable(retenue) && ouverture.attendue()) {
      reglages.put(idAInscrire, CLE_ESPACE_LOCAL);
      retenue = idAInscrire;
    }
  };
  transaction.oncomplete = () => {
    connexion.close();
    if (ouverture.attendue()) {
      poursuivre(retenue);
    }
  };
  transaction.onabort = () => {
    connexion.close();
    ouverture.echouer();
  };
}

// `poursuivre` reçoit une connexion dont le magasin existe.
function ouvrirLaBaseDeLAppareil(
  ouverture: Ouverture,
  poursuivre: (connexion: IDBDatabase) => void,
): void {
  let demande: IDBOpenDBRequest;
  try {
    demande = indexedDB.open(BASE_APPAREIL);
  } catch {
    ouverture.echouer();
    return;
  }
  // Après l'échéance, une réponse tardive ne doit plus rien lire ni écrire (F-002-AC24).
  demande.onupgradeneeded = () => {
    if (ouverture.attendue()) {
      demande.result.createObjectStore(MAGASIN_REGLAGES);
    } else {
      demande.transaction?.abort();
    }
  };
  demande.onsuccess = () => {
    const connexion = demande.result;
    connexion.onversionchange = () => connexion.close();
    if (!ouverture.attendue() || connexion.version > VERSION_LA_PLUS_HAUTE_CONNUE) {
      connexion.close();
      ouverture.echouer();
    } else if (connexion.objectStoreNames.contains(MAGASIN_REGLAGES)) {
      poursuivre(connexion);
    } else {
      connexion.close();
      recreerLeMagasin(connexion.version, ouverture, poursuivre);
    }
  };
  demande.onerror = (evenement) => {
    evenement.preventDefault();
    ouverture.echouer();
  };
}

// Une base née sans son magasin est à sa première version : elle est montée à la suivante. Une
// base déjà réparée à laquelle il manquerait encore n'est pas réparable sans dépasser la version
// connue : c'est une coupure retentée (F-030-AC24).
function recreerLeMagasin(
  version: number,
  ouverture: Ouverture,
  poursuivre: (connexion: IDBDatabase) => void,
): void {
  if (version !== VERSION_D_UNE_BASE_NEUVE) {
    ouverture.echouer();
    return;
  }
  const reparation = {
    nomDeLaBase: BASE_APPAREIL,
    version,
    magasins: [{ nom: MAGASIN_REGLAGES }],
    attendue: ouverture.attendue,
  };
  creerLesMagasinsManquants(reparation, (faite) => {
    if (!faite) {
      ouverture.echouer();
    } else if (ouverture.attendue()) {
      ouvrirLaBaseDeLAppareil(ouverture, poursuivre);
    }
  });
}
