import { forceCloseDatabase } from "fake-indexeddb";
import { vi } from "vitest";

import type { EtatPersistance, Persistance } from "../src/persistance/index.ts";

export const ESPACE_A = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
export const ESPACE_B = "f9e8d7c6-b5a4-4f3e-9d2c-1b0a9f8e7d6c";

// Fournie par Node sous Vitest ; le projet n'a pas ses types (pas de @types/node).
declare function setImmediate(rappel: () => void): unknown;

const MAGASIN_DES_MISES_A_JOUR = "updates";
const TOURS_POUR_VIDER_LA_FILE = 20;

export function attendreEtat(persistance: Persistance, attendu: EtatPersistance): Promise<void> {
  return new Promise((resoudre) => {
    if (persistance.lireEtat() === attendu) {
      resoudre();
      return;
    }
    const desabonner = persistance.abonner(() => {
      if (persistance.lireEtat() === attendu) {
        desabonner();
        resoudre();
      }
    });
  });
}

// `fake-indexeddb` s'ordonnance par `setImmediate`, que l'horloge simulée des tests laisse réelle.
export async function laisserIndexedDbTravailler(): Promise<void> {
  for (let tour = 0; tour < TOURS_POUR_VIDER_LA_FILE; tour += 1) {
    await new Promise<void>((resoudre) => setImmediate(resoudre));
  }
}

export async function nomsDesBases(): Promise<string[]> {
  const bases = await indexedDB.databases();
  return bases.map((base) => base.name ?? "").sort();
}

function demander<T>(demande: IDBRequest<T>): Promise<T> {
  return new Promise((resoudre, rejeter) => {
    demande.onsuccess = () => resoudre(demande.result);
    demande.onerror = () => rejeter(demande.error ?? new Error("demande en échec"));
  });
}

export async function enregistrements(nomDeLaBase: string): Promise<number[][]> {
  const connexion = await demander(indexedDB.open(nomDeLaBase));
  const magasin = connexion
    .transaction(MAGASIN_DES_MISES_A_JOUR)
    .objectStore(MAGASIN_DES_MISES_A_JOUR);
  const lus = (await demander(magasin.getAll())) as Uint8Array[];
  connexion.close();
  return lus.map((enregistrement) => [...enregistrement]);
}

type Gestionnaire = ((evenement: Event) => void) | null;

interface DemandeRetenue {
  onsuccess: Gestionnaire;
  onerror: Gestionnaire;
  onupgradeneeded: Gestionnaire;
  onblocked: Gestionnaire;
  readonly result: unknown;
  readonly transaction: unknown;
  readonly error: unknown;
}

// Les ouvertures de base restent sans réponse à partir de la `premiereRetenue`-ième, jusqu'à
// `repondre()` : la vraie ouverture n'est lancée qu'alors, et ses événements sont transmis.
export function retenirLesOuvertures(premiereRetenue = 1): {
  repondre(): void;
  cesser(): void;
} {
  const ouvrir = indexedDB.open.bind(indexedDB);
  const reponses: (() => void)[] = [];
  let appels = 0;
  const espion = vi.spyOn(indexedDB, "open").mockImplementation((nom, version) => {
    appels += 1;
    if (appels < premiereRetenue) {
      return ouvrir(nom, version);
    }
    let reelle: IDBOpenDBRequest | undefined;
    const retenue: DemandeRetenue = {
      onsuccess: null,
      onerror: null,
      onupgradeneeded: null,
      onblocked: null,
      get result() {
        return reelle?.result;
      },
      get transaction() {
        return reelle?.transaction;
      },
      get error() {
        return reelle?.error;
      },
    };
    reponses.push(() => {
      reelle = ouvrir(nom, version);
      reelle.onsuccess = (evenement) => retenue.onsuccess?.(evenement);
      reelle.onerror = (evenement) => retenue.onerror?.(evenement);
      reelle.onupgradeneeded = (evenement) => retenue.onupgradeneeded?.(evenement);
    });
    return retenue as unknown as IDBOpenDBRequest;
  });
  return {
    repondre: () => reponses.splice(0).forEach((repondre) => repondre()),
    cesser: () => espion.mockRestore(),
  };
}

export function refuserLesOuverturesParUneErreur(): void {
  vi.spyOn(indexedDB, "open").mockImplementation(() => {
    const demande: DemandeRetenue = {
      onsuccess: null,
      onerror: null,
      onupgradeneeded: null,
      onblocked: null,
      result: undefined,
      transaction: null,
      error: new DOMException("refus", "UnknownError"),
    };
    setImmediate(() => demande.onerror?.(new Event("error", { cancelable: true })));
    return demande as unknown as IDBOpenDBRequest;
  });
}

export function refuserLesOuverturesParUneException(): void {
  vi.spyOn(indexedDB, "open").mockImplementation(() => {
    throw new DOMException("refus", "SecurityError");
  });
}

// Connexions ouvertes avec succès pendant le test et que personne n'a refermées, dans l'ordre :
// celles que la bibliothèque tient. La sonde d'une base absente n'en ouvre aucune (sa création est
// annulée), et une lecture brute referme la sienne dès qu'elle a lu (F-030-AC26).
export function suivreLesConnexions(): IDBDatabase[] {
  const ouvrir = indexedDB.open.bind(indexedDB);
  const connexions: IDBDatabase[] = [];
  vi.spyOn(indexedDB, "open").mockImplementation((nom, version) => {
    const demande = ouvrir(nom, version);
    demande.addEventListener("success", () => {
      const connexion = demande.result;
      const fermer = connexion.close.bind(connexion);
      connexion.close = () => {
        const rang = connexions.indexOf(connexion);
        if (rang !== -1) {
          connexions.splice(rang, 1);
        }
        fermer();
      };
      connexions.push(connexion);
    });
    return demande;
  });
  return connexions;
}

// Fermeture forcée de `fake-indexeddb` : la connexion reçoit l'événement `close`, comme dans un
// navigateur dont on efface les données pendant que la base est ouverte.
export function fermerDeForce(connexion: IDBDatabase): void {
  forceCloseDatabase(connexion as unknown as Parameters<typeof forceCloseDatabase>[0]);
}
