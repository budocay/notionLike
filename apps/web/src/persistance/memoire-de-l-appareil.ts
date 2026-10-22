// Mémoire de l'appareil (F-032-AC19, ADR-0008, ADR-0014) : ce que la base de l'appareil retient des
// espaces de l'appareil, dans le magasin des réglages, sans montée de version. Chaque opération est
// une transaction sous une échéance de 10 secondes, jamais rejetée (F-032-AC31) : toute panne de la
// base (absente, coupée, d'une version supérieure à 2, sans son magasin) rend l'issue d'échec. La
// base n'est jamais créée ni réparée ici : c'est l'affaire de l'ouverture de l'espace local.
import { estUuidCanonique } from "../identifiants/uuid-canonique.ts";
import {
  CLE_ESPACE_RETENU,
  cleDeLaMarque,
  cleDuNom,
  cleDuRegistre,
  type EntreeDuRegistre,
  estUneEntree,
  lireLaCle,
} from "./cles-de-l-appareil.ts";
import { BASE_APPAREIL, CLE_ESPACE_LOCAL, MAGASIN_REGLAGES } from "./espace-local.ts";

/** Même échéance qu'une tentative d'ouverture (F-002-AC24, F-032-AC31). */
const ECHEANCE_MS = 10_000;
const VERSION_LA_PLUS_HAUTE_CONNUE = 2;

/** Un espace inscrit au registre de l'appareil, avec ce que l'appareil retient de lui. */
export interface EspaceInscrit {
  readonly idEspace: string;
  readonly entree: EntreeDuRegistre;
  /** Dernier nom connu, tel que l'appareil l'a conservé : la forme est jugée par qui l'affiche. */
  readonly nom: string | undefined;
  /** Vrai : la marque de première synchronisation est présente (F-032-AC8). */
  readonly marque: boolean;
}

export type LectureDeLAppareil =
  | {
      readonly issue: "lue";
      /** Identifiant de l'espace de l'appareil, s'il est lisible. */
      readonly idEspaceLocal: string | undefined;
      /** Les espaces dont l'entrée du registre se lit, dans l'ordre des clés. */
      readonly inscrits: readonly EspaceInscrit[];
      /** Espace retenu, s'il a la forme d'un UUID canonique (F-032-AC17). */
      readonly retenu: string | undefined;
    }
  | { readonly issue: "illisible" };

const ILLISIBLE: LectureDeLAppareil = { issue: "illisible" };

/** Lit en une transaction l'espace local, les entrées, les noms, les marques et le retenu. */
export function lireLAppareil(): Promise<LectureDeLAppareil> {
  return operer<LectureDeLAppareil>("readonly", ILLISIBLE, (magasin, conclure) => {
    const cles = magasin.getAllKeys();
    const valeurs = magasin.getAll();
    valeurs.onsuccess = () => conclure(lectureDe(cles.result, valeurs.result));
  });
}

function lectureDe(cles: readonly unknown[], valeurs: readonly unknown[]): LectureDeLAppareil {
  const entrees = new Map<string, EntreeDuRegistre>();
  const noms = new Map<string, string>();
  const marques = new Set<string>();
  let idEspaceLocal: string | undefined;
  let retenu: string | undefined;
  cles.forEach((cle, rang) => {
    const valeur = valeurs[rang];
    if (cle === CLE_ESPACE_LOCAL) {
      idEspaceLocal = uuidOuRien(valeur);
    } else if (cle === CLE_ESPACE_RETENU) {
      retenu = uuidOuRien(valeur);
    } else {
      noterLaCle(lireLaCle(cle), valeur, { entrees, noms, marques });
    }
  });
  const inscrits = [...entrees].map(([idEspace, entree]) => ({
    idEspace,
    entree,
    nom: noms.get(idEspace),
    marque: marques.has(idEspace),
  }));
  return { issue: "lue", idEspaceLocal, inscrits, retenu };
}

interface Releve {
  readonly entrees: Map<string, EntreeDuRegistre>;
  readonly noms: Map<string, string>;
  readonly marques: Set<string>;
}

// Une valeur d'une autre forme que la sienne est ignorée, comme une clé inconnue.
function noterLaCle(cle: ReturnType<typeof lireLaCle>, valeur: unknown, releve: Releve): void {
  if (cle?.sorte === "registre" && estUneEntree(valeur)) {
    releve.entrees.set(cle.idEspace, { rattachement: valeur.rattachement, droit: valeur.droit });
  } else if (cle?.sorte === "nom" && typeof valeur === "string") {
    releve.noms.set(cle.idEspace, valeur);
  } else if (cle?.sorte === "marque" && valeur === true) {
    releve.marques.add(cle.idEspace);
  }
}

function uuidOuRien(valeur: unknown): string | undefined {
  return typeof valeur === "string" && estUuidCanonique(valeur) ? valeur : undefined;
}

/**
 * Ajout à l'appareil (F-032-AC5) : l'entrée, le dernier nom connu et la marque de première
 * synchronisation, dans une seule transaction ; rend vrai si elle a abouti. Annulée si l'échéance
 * tombe avant sa fin : aucune entrée ne reste après un échec annoncé (F-032-AC6).
 */
export function ajouterALAppareil(
  idEspace: string,
  entree: EntreeDuRegistre,
  nom: string,
): Promise<boolean> {
  if (!estUuidCanonique(idEspace) || !estUneEntree(entree)) {
    return Promise.resolve(false);
  }
  return operer("readwrite", false, (magasin, conclure) => {
    magasin.put(
      { rattachement: entree.rattachement, droit: entree.droit },
      cleDuRegistre(idEspace),
    );
    magasin.put(nom, cleDuNom(idEspace));
    magasin.put(true, cleDeLaMarque(idEspace));
    conclure(true);
  });
}

/**
 * Inscrit le dernier nom connu de chaque espace donné qui a une entrée au registre, relue dans la
 * même transaction : l'appareil ne retient pas le nom d'un espace qu'il ne détient pas (F-032-AC3).
 */
export function noterLesNoms(noms: ReadonlyMap<string, string>): Promise<boolean> {
  const admis = [...noms].filter(([idEspace]) => estUuidCanonique(idEspace));
  if (admis.length === 0) {
    return Promise.resolve(true);
  }
  return operer("readwrite", false, (magasin, conclure) => {
    for (const [idEspace, nom] of admis) {
      const lecture = magasin.get(cleDuRegistre(idEspace));
      lecture.onsuccess = () => {
        if (estUneEntree(lecture.result)) {
          magasin.put(nom, cleDuNom(idEspace));
        }
      };
    }
    conclure(true);
  });
}

/** Retire la marque de première synchronisation (F-032-AC8) ; rend vrai si c'est fait. */
export function retirerLaMarque(idEspace: string): Promise<boolean> {
  if (!estUuidCanonique(idEspace)) {
    return Promise.resolve(false);
  }
  return operer("readwrite", false, (magasin, conclure) => {
    magasin.delete(cleDeLaMarque(idEspace));
    conclure(true);
  });
}

/**
 * Inscrit l'espace retenu ; `undefined` le retire : l'espace de l'appareil est alors retenu
 * (F-032-AC17, retouche R1). Rend vrai si c'est fait.
 */
export function inscrireLEspaceRetenu(idEspace: string | undefined): Promise<boolean> {
  if (idEspace !== undefined && !estUuidCanonique(idEspace)) {
    return Promise.resolve(false);
  }
  return operer("readwrite", false, (magasin, conclure) => {
    if (idEspace === undefined) {
      magasin.delete(CLE_ESPACE_RETENU);
    } else {
      magasin.put(idEspace, CLE_ESPACE_RETENU);
    }
    conclure(true);
  });
}

export type Operation<T> = (magasin: IDBObjectStore, conclure: (valeur: T) => void) => void;

/**
 * Une transaction sur le magasin des réglages de la base de l'appareil, sous une échéance. La
 * valeur passée à `conclure` n'est rendue qu'à la fin de la transaction : une écriture n'est tenue
 * pour faite qu'une fois validée. À l'échéance, la transaction en cours est annulée, et une
 * connexion obtenue plus tard est refermée sans rien lire ni écrire.
 */
export function operer<T>(mode: IDBTransactionMode, echec: T, operation: Operation<T>): Promise<T> {
  return new Promise((resoudre) => {
    let conclu = false;
    let transaction: IDBTransaction | undefined;
    const finir = (valeur: T): void => {
      if (!conclu) {
        conclu = true;
        clearTimeout(echeance);
        resoudre(valeur);
      }
    };
    const echeance = setTimeout(() => {
      try {
        transaction?.abort();
      } catch {
        // La transaction a déjà abouti : son issue arrive par `complete`.
        return;
      }
      finir(echec);
    }, ECHEANCE_MS);
    ouvrir((connexion) => {
      if (connexion === undefined) {
        finir(echec);
      } else if (conclu) {
        connexion.close();
      } else {
        transaction = transiger(connexion, mode, operation, (valeur) => finir(valeur ?? echec));
      }
    });
  });
}

function transiger<T>(
  connexion: IDBDatabase,
  mode: IDBTransactionMode,
  operation: Operation<T>,
  finir: (valeur: T | undefined) => void,
): IDBTransaction | undefined {
  let valeur: T | undefined;
  let transaction: IDBTransaction;
  try {
    transaction = connexion.transaction(MAGASIN_REGLAGES, mode);
    operation(transaction.objectStore(MAGASIN_REGLAGES), (lue) => {
      valeur = lue;
    });
  } catch {
    connexion.close();
    finir(undefined);
    return undefined;
  }
  transaction.oncomplete = () => {
    connexion.close();
    finir(valeur);
  };
  transaction.onabort = () => {
    connexion.close();
    finir(undefined);
  };
  return transaction;
}

function ouvrir(poursuivre: (connexion: IDBDatabase | undefined) => void): void {
  let demande: IDBOpenDBRequest;
  try {
    demande = indexedDB.open(BASE_APPAREIL);
  } catch {
    poursuivre(undefined);
    return;
  }
  // Une base absente n'est pas créée ici : la montée de version est annulée.
  demande.onupgradeneeded = () => demande.transaction?.abort();
  demande.onsuccess = () => {
    const connexion = demande.result;
    connexion.onversionchange = () => connexion.close();
    if (
      connexion.version > VERSION_LA_PLUS_HAUTE_CONNUE ||
      !connexion.objectStoreNames.contains(MAGASIN_REGLAGES)
    ) {
      connexion.close();
      poursuivre(undefined);
      return;
    }
    poursuivre(connexion);
  };
  demande.onerror = (evenement) => {
    evenement.preventDefault();
    poursuivre(undefined);
  };
}
