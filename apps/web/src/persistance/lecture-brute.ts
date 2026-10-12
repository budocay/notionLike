// Lecture brute de la base d'un document (F-030, vocabulaire) : par l'API IndexedDB seule, sans la
// bibliothèque de persistance, et sans écrire un octet. Une base absente le reste : sa création est
// annulée. Ce qui est lu va à un document témoin (`temoin.ts`).

/** Magasin des mises à jour d'une base de document, tel que `y-indexeddb@9.0.12` le nomme. */
export const MAGASIN_DES_MISES_A_JOUR = "updates";

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

// Par l'étiquette du type et non par `instanceof` : un tableau d'octets cloné par le stockage peut
// venir d'un autre domaine d'exécution que celui de ce module, où `instanceof` le refuserait.
function estUnBlocDOctets(enregistrement: unknown): enregistrement is Uint8Array {
  return Object.prototype.toString.call(enregistrement) === "[object Uint8Array]";
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
  // Un enregistrement d'un autre type n'est pas une mise à jour : lecture en échec (F-030-AC28).
  lecture.onsuccess = () => {
    const lus = lecture.result;
    rendre(lus.every(estUnBlocDOctets) ? { issue: "lue", enregistrements: lus } : ECHEC);
  };
  lecture.onerror = (evenement) => {
    evenement.preventDefault();
    rendre(ECHEC);
  };
  transaction.onabort = () => rendre(ECHEC);
}
