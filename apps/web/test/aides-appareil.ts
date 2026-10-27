// Aides des tests de F-032 : la base de l'appareil lue et écrite sans le module, clé par clé, pour
// poser ce qu'un appareil porte (registre, noms, marques, espace retenu) et constater ce qui reste.
export const BASE_DE_L_APPAREIL = "notionlike:appareil";
const MAGASIN = "reglages";

/** Espaces témoins de F-032 : celui de l'appareil, deux espaces ajoutés, un troisième. */
export const E_APPAREIL = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
export const E_ALPHA = "2b3c4d5e-6f70-4b8c-9d0e-1f2a3b4c5d6e";
export const E_BETA = "3c4d5e6f-7081-4c9d-8e1f-2a3b4c5d6e7f";
export const E_GAMMA = "4d5e6f70-8192-4dae-9f20-3b4c5d6e7f80";
export const P_UN = "5e6f7081-92a3-4ebf-a031-4c5d6e7f8091";
export const P_DEUX = "6f708192-a3b4-4fc0-b142-5d6e7f8091a2";

export const ECRITURE = { rattachement: "adopte", droit: "ecriture" } as const;
export const LECTURE = { rattachement: "adopte", droit: "lecture" } as const;

function attendre<T>(demande: IDBRequest<T>): Promise<T> {
  return new Promise((resoudre, rejeter) => {
    demande.onsuccess = () => resoudre(demande.result);
    demande.onerror = () => rejeter(demande.error ?? new Error("demande en échec"));
  });
}

async function ouvrirLAppareil(): Promise<IDBDatabase> {
  const demande = indexedDB.open(BASE_DE_L_APPAREIL);
  demande.onupgradeneeded = () => {
    if (!demande.result.objectStoreNames.contains(MAGASIN)) {
      demande.result.createObjectStore(MAGASIN);
    }
  };
  return attendre(demande);
}

/** Pose ces valeurs sous ces clés, sans le module ; `undefined` retire la clé. */
export async function poserDansLAppareil(
  valeurs: Readonly<Record<string, unknown>>,
): Promise<void> {
  const connexion = await ouvrirLAppareil();
  const transaction = connexion.transaction(MAGASIN, "readwrite");
  const magasin = transaction.objectStore(MAGASIN);
  for (const [cle, valeur] of Object.entries(valeurs)) {
    if (valeur === undefined) {
      magasin.delete(cle);
    } else {
      magasin.put(valeur, cle);
    }
  }
  await new Promise((resoudre) => {
    transaction.oncomplete = resoudre;
  });
  connexion.close();
}

/** Tout ce que le magasin de l'appareil porte, clé par clé, lu sans le module. */
export async function contenuDeLAppareil(): Promise<Record<string, unknown>> {
  const connexion = await attendre(indexedDB.open(BASE_DE_L_APPAREIL));
  const magasin = connexion.transaction(MAGASIN).objectStore(MAGASIN);
  const [cles, valeurs] = await Promise.all([
    attendre(magasin.getAllKeys()),
    attendre(magasin.getAll()),
  ]);
  connexion.close();
  return Object.fromEntries(cles.map((cle, rang) => [String(cle), valeurs[rang]]));
}

export async function versionDeLAppareil(): Promise<number> {
  const connexion = await attendre(indexedDB.open(BASE_DE_L_APPAREIL));
  const { version } = connexion;
  connexion.close();
  return version;
}

/** Une base de document vide sous ce nom, avec le magasin de la bibliothèque et une valeur. */
export async function poserUneBase(nom: string): Promise<void> {
  const demande = indexedDB.open(nom);
  demande.onupgradeneeded = () => {
    demande.result
      .createObjectStore("updates", { autoIncrement: true })
      .put(new Uint8Array([0, 0]));
    demande.result.createObjectStore("custom");
  };
  (await attendre(demande)).close();
}

/** Le navigateur ne permet pas l'énumération des bases (Firefox antérieur à 126, H7). */
export function retirerLEnumeration(): void {
  Object.defineProperty(indexedDB, "databases", { value: undefined, configurable: true });
}

/** Rend l'énumération des bases, retirée par `retirerLEnumeration`. */
export function rendreLEnumeration(): void {
  Reflect.deleteProperty(indexedDB, "databases");
}

/** Une base de document qui porte cette mise à jour, rangée comme la bibliothèque la range. */
export async function poserUneBaseQuiPorte(nom: string, miseAJour: Uint8Array): Promise<void> {
  const demande = indexedDB.open(nom);
  demande.onupgradeneeded = () => {
    demande.result.createObjectStore("updates", { autoIncrement: true }).put(miseAJour);
    demande.result.createObjectStore("custom");
  };
  (await attendre(demande)).close();
}

/** Le nom de la base du document d'un espace, écrit en toutes lettres pour les témoins. */
export function baseDEspace(idEspace: string): string {
  return `notionlike:espace:${idEspace}`;
}

interface CanalSimule {
  postMessage(message: unknown): void;
  close(): void;
  onmessage: ((evenement: MessageEvent) => void) | null;
}

/**
 * Des canaux entre onglets simulés, reliés par leur nom comme `BroadcastChannel` les relie : un
 * message va, au tour suivant, à chaque autre canal ouvert du même nom ; un envoi sur un canal
 * fermé lève, comme dans le navigateur (veille F-032, point 7).
 */
export function canauxRelies(): {
  ouvrirUnCanal: (nom: string) => CanalSimule;
  ouverts: () => number;
} {
  const parNom = new Map<string, Set<CanalSimule>>();
  const ouvrirUnCanal = (nom: string): CanalSimule => {
    const freres = parNom.get(nom) ?? new Set<CanalSimule>();
    parNom.set(nom, freres);
    let ferme = false;
    const canal: CanalSimule = {
      onmessage: null,
      postMessage: (message) => {
        if (ferme) {
          throw new DOMException("canal fermé", "InvalidStateError");
        }
        for (const autre of freres) {
          if (autre !== canal) {
            setTimeout(() => autre.onmessage?.(new MessageEvent("message", { data: message })), 0);
          }
        }
      },
      close: () => {
        ferme = true;
        freres.delete(canal);
      },
    };
    freres.add(canal);
    return canal;
  };
  return {
    ouvrirUnCanal,
    ouverts: () => [...parNom.values()].reduce((total, freres) => total + freres.size, 0),
  };
}
