// Registre de l'appareil (F-013, H3) : pour chaque espace que l'appareil détient, son rattachement
// et son dernier droit connu, et rien d'autre (ni nom, ni courriel, ni identifiant de compte). Il vit
// dans la base de l'appareil, à côté de l'identifiant de l'espace local, une clé par espace : la
// feature qui ouvrira d'autres espaces y en ajoutera sans le migrer. L'absence d'entrée vaut
// `local` : rien n'inscrit jamais `local` (F-013-AC4).
import { estUuidCanonique } from "../identifiants/uuid-canonique.ts";
import { BASE_APPAREIL, CLE_ESPACE_LOCAL, MAGASIN_REGLAGES } from "./espace-local.ts";

export type Droit = "ecriture" | "lecture";

/** Une entrée du registre : l'espace est adopté, avec le dernier droit que l'appareil a lu. */
export interface EntreeDuRegistre {
  readonly rattachement: "adopte";
  readonly droit: Droit;
}

export type LectureDuRegistre =
  | { readonly issue: "lu"; readonly entree: EntreeDuRegistre | undefined }
  | { readonly issue: "illisible" };

const PREFIXE_DES_CLES = "registre:";
/** Même échéance qu'une tentative d'ouverture (F-002-AC24). */
const ECHEANCE_MS = 10_000;
const VERSION_LA_PLUS_HAUTE_CONNUE = 2;
const ILLISIBLE: LectureDuRegistre = { issue: "illisible" };

function cleDe(idEspace: string): string {
  return `${PREFIXE_DES_CLES}${idEspace}`;
}

function estUneEntree(valeur: unknown): valeur is EntreeDuRegistre {
  if (typeof valeur !== "object" || valeur === null) {
    return false;
  }
  const { rattachement, droit } = valeur as Record<string, unknown>;
  return (
    rattachement === "adopte" &&
    (droit === "ecriture" || droit === "lecture") &&
    Object.keys(valeur).length === 2
  );
}

/** Lit l'entrée d'un espace. Jamais rejetée : tout échec, toute valeur inconnue rend `illisible`. */
export function lireLeRegistre(idEspace: string): Promise<LectureDuRegistre> {
  if (!estUuidCanonique(idEspace)) {
    return Promise.resolve(ILLISIBLE);
  }
  return operer<LectureDuRegistre>("readonly", ILLISIBLE, (magasin, conclure) => {
    const lecture = magasin.get(cleDe(idEspace));
    lecture.onsuccess = () => {
      const valeur: unknown = lecture.result;
      conclure(
        valeur === undefined
          ? { issue: "lu", entree: undefined }
          : estUneEntree(valeur)
            ? { issue: "lu", entree: valeur }
            : ILLISIBLE,
      );
    };
  });
}

/** Inscrit l'entrée d'un espace ; rend vrai si la transaction a abouti. Jamais rejetée. */
export function inscrireAuRegistre(idEspace: string, entree: EntreeDuRegistre): Promise<boolean> {
  if (!estUuidCanonique(idEspace) || !estUneEntree(entree)) {
    return Promise.resolve(false);
  }
  return operer("readwrite", false, (magasin, conclure) => {
    magasin.put({ rattachement: entree.rattachement, droit: entree.droit }, cleDe(idEspace));
    conclure(true);
  });
}

/**
 * Retire l'entrée d'un espace ; avec `oublierLEspaceLocal`, retire aussi l'identifiant de l'espace
 * local s'il est celui-là : le lancement suivant est un premier lancement (F-013-AC24, F-002-AC1).
 */
export function retirerDuRegistre(
  idEspace: string,
  oublierLEspaceLocal: boolean,
): Promise<boolean> {
  if (!estUuidCanonique(idEspace)) {
    return Promise.resolve(false);
  }
  return operer("readwrite", false, (magasin, conclure) => {
    magasin.delete(cleDe(idEspace));
    if (!oublierLEspaceLocal) {
      conclure(true);
      return;
    }
    const lecture = magasin.get(CLE_ESPACE_LOCAL);
    lecture.onsuccess = () => {
      if (lecture.result === idEspace) {
        magasin.delete(CLE_ESPACE_LOCAL);
      }
      conclure(true);
    };
  });
}

type Operation<T> = (magasin: IDBObjectStore, conclure: (valeur: T) => void) => void;

// Une transaction sur le magasin des réglages de la base de l'appareil, sous une échéance. La
// valeur passée à `conclure` n'est rendue qu'à la fin de la transaction : une écriture n'est tenue
// pour faite qu'une fois validée. La base n'est jamais créée ni réparée ici : c'est l'affaire de
// l'ouverture de l'espace local (F-030-AC24) ; sans elle, le registre est illisible.
function operer<T>(mode: IDBTransactionMode, echec: T, operation: Operation<T>): Promise<T> {
  return new Promise((resoudre) => {
    let conclu = false;
    const finir = (valeur: T): void => {
      if (!conclu) {
        conclu = true;
        clearTimeout(echeance);
        resoudre(valeur);
      }
    };
    const echeance = setTimeout(() => finir(echec), ECHEANCE_MS);
    ouvrir((connexion) => {
      if (connexion === undefined) {
        finir(echec);
        return;
      }
      transiger(connexion, mode, operation, (valeur) => finir(valeur ?? echec));
    });
  });
}

function transiger<T>(
  connexion: IDBDatabase,
  mode: IDBTransactionMode,
  operation: Operation<T>,
  finir: (valeur: T | undefined) => void,
): void {
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
    return;
  }
  transaction.oncomplete = () => {
    connexion.close();
    finir(valeur);
  };
  transaction.onabort = () => {
    connexion.close();
    finir(undefined);
  };
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
