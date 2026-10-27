import type * as Y from "yjs";

import { estUuidCanonique } from "../identifiants/uuid-canonique.ts";
import {
  type Ouverture,
  ouvrirPersistance,
  ouvrirSousEcheance,
  type Persistance,
} from "./indexeddb.ts";
import { cleDuRegistre, estUneEntree } from "./cles-de-l-appareil.ts";
import { enumererLesBases } from "./enumeration.ts";
import { nomDeBase } from "./nom-de-base.ts";
import { creerLesMagasinsManquants } from "./reparation.ts";

// Base de l'appareil : ce n'est pas une base de document (ADR-0008). Elle naît à la version 1 avec
// son magasin ; la version 2 est celle d'une base réparée, à laquelle le magasin manquait
// (F-030-AC24). Au-delà, l'application ne la connaît pas : elle ne l'abaisse ni ne la supprime.
export const BASE_APPAREIL = "notionlike:appareil";
const VERSION_D_UNE_BASE_NEUVE = 1;
const VERSION_LA_PLUS_HAUTE_CONNUE = 2;
export const MAGASIN_REGLAGES = "reglages";
export const CLE_ESPACE_LOCAL = "espace-local";

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

/**
 * Persistance du document d'un espace inscrit au registre de l'appareil (F-032) : son identifiant
 * est celui qu'on lui donne, contrôlé par la fonction de nommage, et sa base est ouverte telle
 * quelle, sans être vidée ni renommée (F-032-AC9). Aucune réparation : seul l'espace de l'appareil
 * en connaît une (F-030-AC23).
 */
export function ouvrirEspaceInscrit(doc: Y.Doc, idEspace: string): PersistanceEspaceLocal {
  nomDeLEspace(idEspace);
  const persistance = ouvrirPersistance(doc, { type: "espace", idEspace });
  return { ...persistance, idEspace: () => idEspace };
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
// document soit lue, renommée ni fusionnée (F-030-AC23). Parmi les bases d'espace de l'appareil,
// celles d'un espace inscrit au registre sont celles d'espaces ajoutés, que la liste des espaces
// montre : elles sont écartées (F-032-AC23, D-009). Une seule base restante : c'est celle de
// l'utilisateur. Aucune : le candidat. Plusieurs, énumération impossible ou registre illisible :
// rien ne dit laquelle est la bonne, le candidat est inscrit et les autres restent intactes.
function remplacerLaValeurIllisible(
  idCandidat: string,
  ouverture: Ouverture,
  poursuivre: (idEspace: string) => void,
): void {
  enumererLesBases((bases) => {
    if (!ouverture.attendue()) {
      return;
    }
    const espaces = bases
      ?.filter((designation) => designation.type === "espace")
      .map((designation) => designation.idEspace);
    ouvrirLaBaseDeLAppareil(ouverture, (connexion) => {
      const inscrire = (choix: Choix): void => {
        if (choix.signaler) {
          ouverture.signalerDesBasesNonRattachees();
        }
        // La valeur est relue dans la transaction qui l'écrit, et n'est remplacée que si elle est
        // encore illisible : deux onglets lancés ensemble retiennent le même identifiant.
        const remplacable = (valeur: unknown): boolean => !estUnIdentifiant(valeur);
        lireOuInscrire(
          { connexion, ouverture, idAInscrire: choix.idAInscrire, remplacable },
          (valeur) => (estUnIdentifiant(valeur) ? poursuivre(valeur) : ouverture.echouer()),
        );
      };
      if (espaces === undefined || espaces.length === 0) {
        inscrire({ idAInscrire: idCandidat, signaler: espaces === undefined });
        return;
      }
      lireLesInscriptions(connexion, espaces, (inscrits) => {
        if (ouverture.attendue()) {
          inscrire(choisir(espaces, inscrits, idCandidat));
        } else {
          connexion.close();
        }
      });
    });
  });
}

interface Choix {
  readonly idAInscrire: string;
  /** Vrai : des pages d'avant peuvent rester sur l'appareil sans être rattachées (F-030-AC23). */
  readonly signaler: boolean;
}

function choisir(
  espaces: readonly string[],
  inscrits: ReadonlySet<string> | undefined,
  idCandidat: string,
): Choix {
  if (inscrits === undefined) {
    return { idAInscrire: idCandidat, signaler: true };
  }
  const restantes = espaces.filter((idEspace) => !inscrits.has(idEspace));
  const [seule] = restantes;
  if (restantes.length === 1 && seule !== undefined) {
    return { idAInscrire: seule, signaler: false };
  }
  return { idAInscrire: idCandidat, signaler: restantes.length > 1 };
}

/**
 * Les espaces énumérés qui ont une entrée au registre, lus dans une transaction en lecture ;
 * `undefined` : registre illisible, parce que la transaction échoue ou qu'une valeur d'une autre
 * forme qu'une entrée est rangée sous la clé d'un espace énuméré (F-032-AC23, retouche R3). La
 * connexion reste ouverte pour l'inscription qui suit, sauf en cas d'échec.
 */
function lireLesInscriptions(
  connexion: IDBDatabase,
  espaces: readonly string[],
  conclure: (inscrits: ReadonlySet<string> | undefined) => void,
): void {
  const inscrits = new Set<string>();
  let illisible = false;
  let transaction: IDBTransaction;
  try {
    transaction = connexion.transaction(MAGASIN_REGLAGES, "readonly");
    const reglages = transaction.objectStore(MAGASIN_REGLAGES);
    for (const idEspace of espaces) {
      const lecture = reglages.get(cleDuRegistre(idEspace));
      lecture.onsuccess = () => {
        if (estUneEntree(lecture.result)) {
          inscrits.add(idEspace);
        } else if (lecture.result !== undefined) {
          illisible = true;
        }
      };
    }
  } catch {
    conclure(undefined);
    return;
  }
  transaction.oncomplete = () => conclure(illisible ? undefined : inscrits);
  transaction.onabort = () => conclure(undefined);
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
