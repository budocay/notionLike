// Transaction sous échéance sur la base de l'appareil (F-032-AC31, ADR-0008, ADR-0014) : seule
// porte de la mémoire de l'appareil et du registre vers le magasin des réglages. Toute panne de la
// base (absente, coupée, d'une version supérieure à 2, sans son magasin) rend la valeur d'échec,
// jamais un rejet ; la base n'est jamais créée ni réparée ici.
import { BASE_APPAREIL, MAGASIN_REGLAGES } from "./espace-local.ts";

/** Même échéance qu'une tentative d'ouverture (F-002-AC24, F-032-AC31). */
const ECHEANCE_MS = 10_000;
const VERSION_LA_PLUS_HAUTE_CONNUE = 2;

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
