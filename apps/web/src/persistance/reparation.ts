// Réparation d'une base à laquelle il manque un magasin (F-030-AC24, AC28) : une montée de
// version, seul moyen qu'IndexedDB offre d'ajouter un magasin sans supprimer la base. Rien de ce
// que la base porte d'autre n'est touché.
interface MagasinAttendu {
  readonly nom: string;
  readonly options?: IDBObjectStoreParameters;
}

interface Reparation {
  readonly nomDeLaBase: string;
  /** Version que la base a aujourd'hui : elle est montée d'un cran. */
  readonly version: number;
  readonly magasins: readonly MagasinAttendu[];
  /** Faux dès que la tentative qui répare est finie : rien n'est créé hors d'elle. */
  readonly attendue: () => boolean;
}

/**
 * Crée les magasins qui manquent. Tant qu'un autre onglet tient une connexion à cette base, la
 * montée reste en attente (`blocked`) : c'est l'échéance de la tentative qui rend la main, et la
 * montée est annulée si elle aboutit après elle.
 */
export function creerLesMagasinsManquants(
  reparation: Reparation,
  conclure: (reparee: boolean) => void,
): void {
  let demande: IDBOpenDBRequest;
  try {
    demande = indexedDB.open(reparation.nomDeLaBase, reparation.version + 1);
  } catch {
    conclure(false);
    return;
  }
  demande.onupgradeneeded = () => {
    if (!reparation.attendue()) {
      demande.transaction?.abort();
      return;
    }
    const base = demande.result;
    for (const { nom, options } of reparation.magasins) {
      if (!base.objectStoreNames.contains(nom)) {
        base.createObjectStore(nom, options);
      }
    }
  };
  demande.onsuccess = () => {
    demande.result.close();
    conclure(true);
  };
  demande.onerror = (evenement) => {
    evenement.preventDefault();
    conclure(false);
  };
}
