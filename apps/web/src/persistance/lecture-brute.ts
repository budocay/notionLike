// Lecture brute de la base d'un document (F-030, vocabulaire) : par l'API IndexedDB seule, sans la
// bibliothèque de persistance, et sans écrire un octet. Une base absente le reste : sa création est
// annulée. Le document témoin reçoit ce qui est lu ; rien ne l'affiche ni ne l'enregistre.
import * as Y from "yjs";

const MAGASIN_DES_MISES_A_JOUR = "updates";

type LectureBrute =
  | { readonly issue: "echec" }
  | { readonly issue: "absente" }
  | { readonly issue: "sans-magasin"; readonly version: number }
  | { readonly issue: "lue"; readonly enregistrements: readonly Uint8Array[] };

const ECHEC: LectureBrute = { issue: "echec" };

/**
 * Lit les enregistrements de la base, puis referme sa connexion. `conclure` est appelé une fois au
 * plus ; la fonction rendue abandonne la lecture : plus rien n'est conclu, la connexion est fermée.
 */
export function lireLaBase(nom: string, conclure: (lecture: LectureBrute) => void): () => void {
  let connexion: IDBDatabase | undefined;
  let conclue = false;
  const clore = (): void => {
    conclue = true;
    connexion?.close();
  };
  const rendre = (lecture: LectureBrute): void => {
    if (!conclue) {
      clore();
      conclure(lecture);
    }
  };
  let demande: IDBOpenDBRequest;
  try {
    demande = indexedDB.open(nom);
  } catch {
    rendre(ECHEC);
    return clore;
  }
  let creationAnnulee = false;
  demande.onupgradeneeded = () => {
    creationAnnulee = true;
    demande.transaction?.abort();
  };
  demande.onsuccess = () => {
    connexion = demande.result;
    if (conclue) {
      connexion.close();
    } else {
      lireLeMagasin(connexion, rendre);
    }
  };
  demande.onerror = (evenement) => {
    evenement.preventDefault();
    rendre(creationAnnulee ? { issue: "absente" } : ECHEC);
  };
  return clore;
}

function lireLeMagasin(connexion: IDBDatabase, rendre: (lecture: LectureBrute) => void): void {
  // Cette connexion ne bloque jamais la réparation qu'un autre onglet lance (F-030-AC28).
  connexion.onversionchange = () => connexion.close();
  if (!connexion.objectStoreNames.contains(MAGASIN_DES_MISES_A_JOUR)) {
    rendre({ issue: "sans-magasin", version: connexion.version });
    return;
  }
  let transaction: IDBTransaction;
  let lecture: IDBRequest<unknown[]>;
  try {
    transaction = connexion.transaction(MAGASIN_DES_MISES_A_JOUR, "readonly");
    lecture = transaction.objectStore(MAGASIN_DES_MISES_A_JOUR).getAll();
  } catch {
    rendre(ECHEC);
    return;
  }
  lecture.onsuccess = () => {
    rendre({ issue: "lue", enregistrements: lecture.result as Uint8Array[] });
  };
  lecture.onerror = (evenement) => {
    evenement.preventDefault();
    rendre(ECHEC);
  };
  transaction.onabort = () => rendre(ECHEC);
}

/** Document témoin rempli de ces enregistrements ; `undefined` si l'un d'eux est inapplicable. */
export function temoinDe(enregistrements: readonly Uint8Array[]): Y.Doc | undefined {
  const temoin = new Y.Doc();
  try {
    enregistrements.forEach((enregistrement) => Y.applyUpdate(temoin, enregistrement));
    return temoin;
  } catch {
    temoin.destroy();
    return undefined;
  }
}

/**
 * Vrai si le témoin porte déjà tout cet état : le lui appliquer n'y change rien. Yjs n'émet de mise
 * à jour que pour ce qu'une transaction ajoute ou supprime : les suppressions, qu'un vecteur d'état
 * ne porte pas, sont donc couvertes (F-030 H13, exécuté).
 */
export function porteTout(temoin: Y.Doc, etat: Uint8Array): boolean {
  let change = false;
  const noter = (): void => {
    change = true;
  };
  temoin.on("update", noter);
  try {
    Y.applyUpdate(temoin, etat);
  } finally {
    temoin.off("update", noter);
  }
  return !change;
}
