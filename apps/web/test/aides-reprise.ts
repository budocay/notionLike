// Aides des tests de F-030 : pannes du stockage que `fake-indexeddb` ne produit pas de lui-même,
// et ce que la bibliothèque de persistance laisse voir d'elle sans être importée par les tests
// (F-030-AC20 : seul `src/persistance/indexeddb.ts` l'importe).
import { act } from "@testing-library/react";
import { vi } from "vitest";
import * as Y from "yjs";

import type { EtatPersistance, Persistance } from "../src/persistance/index.ts";

interface TransactionInterne {
  _abort(nomDeLErreur: string): void;
}

/**
 * États pris par une persistance après l'appel, dans l'ordre. Une diffusion qui ne change pas
 * l'état (une modification non enregistrée de plus ou de moins) n'y ajoute rien.
 */
export function etatsSuccessifs(persistance: Persistance): EtatPersistance[] {
  const etats: EtatPersistance[] = [];
  let dernier = persistance.lireEtat();
  persistance.abonner(() => {
    const etat = persistance.lireEtat();
    if (etat !== dernier) {
      dernier = etat;
      etats.push(etat);
    }
  });
  return etats;
}

/**
 * Les `fois` prochains ajouts à un magasin réussissent pour la demande, puis leur transaction est
 * annulée par le moteur, comme un quota atteint : la base ne garde rien, la connexion reçoit
 * `error` puis `abort`. Les ajouts suivants aboutissent.
 */
export function annulerLesProchainsAjouts(fois: number): void {
  const ajouter = IDBObjectStore.prototype.add;
  let restants = fois;
  vi.spyOn(IDBObjectStore.prototype, "add").mockImplementation(function (
    this: IDBObjectStore,
    valeur: unknown,
  ) {
    const demande = ajouter.call(this, valeur);
    if (restants > 0) {
      restants -= 1;
      const transaction = this.transaction as unknown as TransactionInterne;
      demande.addEventListener("success", () => transaction._abort("QuotaExceededError"));
    }
    return demande;
  });
}

/**
 * Les `fois` prochains ajouts à un magasin sont perdus sans bruit : la demande réussit, rien n'est
 * écrit, et la connexion ne reçoit ni `error`, ni `abort`, ni `close`.
 */
export function perdreLesProchainsAjouts(fois: number): void {
  const ajouter = IDBObjectStore.prototype.add;
  let restants = fois;
  vi.spyOn(IDBObjectStore.prototype, "add").mockImplementation(function (
    this: IDBObjectStore,
    valeur: unknown,
  ) {
    if (restants > 0) {
      restants -= 1;
      return this.count() as unknown as IDBRequest<IDBValidKey>;
    }
    return ajouter.call(this, valeur);
  });
}

interface InstanceDeLaBibliotheque {
  readonly synced: boolean;
}

function estUneInstance(origine: unknown): origine is InstanceDeLaBibliotheque {
  return typeof origine === "object" && origine !== null && "whenSynced" in origine;
}

/**
 * Instances de la bibliothèque qui ont appliqué un état relu à ce document, dans l'ordre : chacune
 * signe de son identité la transaction où elle l'applique, juste avant d'émettre `synced`.
 */
export function instancesAyantRelu(doc: Y.Doc): { readonly synced: boolean }[] {
  const instances: InstanceDeLaBibliotheque[] = [];
  doc.on("beforeTransaction", (transaction: Y.Transaction) => {
    if (estUneInstance(transaction.origin)) {
      instances.push(transaction.origin);
    }
  });
  return instances;
}

type LectureDuMagasin = () => IDBRequest<unknown[]>;

/**
 * Appelle `intercepter` à chaque lecture brute du magasin d'une base de document (un `getAll` sans
 * borne ; la bibliothèque, elle, borne toujours les siens), avec son rang à partir de 1 et la
 * lecture réelle. Ce que `intercepter` rend est la demande que le module reçoit.
 */
export function intercepterLesLecturesBrutes(
  intercepter: (rang: number, lire: LectureDuMagasin) => IDBRequest<unknown[]>,
): void {
  const toutLire = IDBObjectStore.prototype.getAll;
  let rang = 0;
  vi.spyOn(IDBObjectStore.prototype, "getAll").mockImplementation(function (
    this: IDBObjectStore,
    ...bornes: unknown[]
  ) {
    const lire = (): IDBRequest<unknown[]> =>
      toutLire.apply(this, bornes as Parameters<typeof toutLire>);
    if (bornes.length > 0) {
      return lire();
    }
    rang += 1;
    return intercepter(rang, lire);
  });
}

/** Une demande qui ne répond jamais. */
export function demandeSansReponse(): IDBRequest<unknown[]> {
  return { onsuccess: null, onerror: null } as unknown as IDBRequest<unknown[]>;
}

/** État encodé d'un document vierge auquel sont appliqués ces enregistrements. */
export function etatRelu(lus: readonly number[][]): number[] {
  const doc = new Y.Doc();
  lus.forEach((enregistrement) => Y.applyUpdate(doc, Uint8Array.from(enregistrement)));
  return [...Y.encodeStateAsUpdate(doc)];
}

/** Instant, à l'horloge du test, de chaque demande d'ouverture d'une base faite après l'appel. */
export function instantsDesOuvertures(): number[] {
  const instants: number[] = [];
  const dejaEspionnee = vi.isMockFunction(indexedDB.open);
  const ouvrir = indexedDB.open.bind(indexedDB);
  if (dejaEspionnee) {
    const simulee = vi.mocked(indexedDB.open).getMockImplementation() ?? ouvrir;
    vi.mocked(indexedDB.open).mockImplementation((nom, version) => {
      instants.push(Date.now());
      return simulee(nom, version);
    });
  } else {
    vi.spyOn(indexedDB, "open").mockImplementation((nom, version) => {
      instants.push(Date.now());
      return ouvrir(nom, version);
    });
  }
  return instants;
}

/** Horloge simulée, date comprise : le module mesure l'intervalle entre deux tentatives. */
export function simulerLHorloge(): void {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
}

// `process` de Node, sous Vitest ; le projet n'a pas ses types (pas de @types/node).
declare const process: {
  on(evenement: string, ecouteur: (raison: unknown) => void): void;
  off(evenement: string, ecouteur: (raison: unknown) => void): void;
};

/**
 * Erreurs non interceptées et rejets de promesse non gérés émis pendant le test, relevés jusqu'à
 * l'appel de la fonction rendue, qui cesse l'écoute et rend ce qui a été relevé.
 */
export function ecouterLesErreursNonInterceptees(): () => unknown[] {
  const relevees: unknown[] = [];
  const noter = (raison: unknown): void => void relevees.push(raison);
  process.on("unhandledRejection", noter);
  process.on("uncaughtException", noter);
  return () => {
    process.off("unhandledRejection", noter);
    process.off("uncaughtException", noter);
    return relevees;
  };
}

/** L'onglet passe à cet état de visibilité, et l'événement du navigateur est émis. */
export function rendreLOnglet(visibilite: DocumentVisibilityState): void {
  vi.spyOn(document, "visibilityState", "get").mockReturnValue(visibilite);
  act(() => void document.dispatchEvent(new Event("visibilitychange")));
}

const BASE_DE_L_APPAREIL = "notionlike:appareil";
const MAGASIN_DES_REGLAGES = "reglages";
const CLE_DE_L_ESPACE_LOCAL = "espace-local";

function attendre<T>(demande: IDBRequest<T>): Promise<T> {
  return new Promise((resoudre, rejeter) => {
    demande.onsuccess = () => resoudre(demande.result);
    demande.onerror = () => rejeter(demande.error ?? new Error("demande en échec"));
  });
}

/**
 * Connexion ouverte sur une base, sans numéro de version, et tenue : elle ne se ferme pas à la
 * réception de `versionchange`, comme le ferait un onglet d'une autre version ou un outil.
 */
export function tenirUneConnexion(nom: string): Promise<IDBDatabase> {
  return attendre(indexedDB.open(nom));
}

/** Crée une base à sa première version avec ces seuls magasins, chacun portant une valeur. */
export async function creerUneBase(nom: string, magasins: readonly string[]): Promise<void> {
  const demande = indexedDB.open(nom);
  demande.onupgradeneeded = () => {
    for (const magasin of magasins) {
      demande.result.createObjectStore(magasin).put("gardée", "valeur");
    }
  };
  (await attendre(demande)).close();
}

export interface MagasinDecrit {
  readonly cleAutomatique: boolean;
  readonly chemin: unknown;
  readonly valeurs: unknown[];
}

/** Version de la base et, pour chacun de ses magasins, ses options et ce qu'il porte. */
export async function decrireLaBase(
  nom: string,
): Promise<{ version: number; magasins: Record<string, MagasinDecrit> }> {
  const connexion = await attendre(indexedDB.open(nom));
  const magasins: Record<string, MagasinDecrit> = {};
  for (const nomDuMagasin of connexion.objectStoreNames) {
    const magasin = connexion.transaction(nomDuMagasin).objectStore(nomDuMagasin);
    magasins[nomDuMagasin] = {
      cleAutomatique: magasin.autoIncrement,
      chemin: magasin.keyPath,
      valeurs: await attendre(magasin.getAll()),
    };
  }
  const { version } = connexion;
  connexion.close();
  return { version, magasins };
}

/** Inscrit cette valeur à la place de l'identifiant de l'espace local, sans le module. */
export async function inscrireALaPlaceDeLIdentifiant(valeur: unknown): Promise<void> {
  const demande = indexedDB.open(BASE_DE_L_APPAREIL);
  demande.onupgradeneeded = () => demande.result.createObjectStore(MAGASIN_DES_REGLAGES);
  const connexion = await attendre(demande);
  const transaction = connexion.transaction(MAGASIN_DES_REGLAGES, "readwrite");
  transaction.objectStore(MAGASIN_DES_REGLAGES).put(valeur, CLE_DE_L_ESPACE_LOCAL);
  await new Promise((resoudre) => {
    transaction.oncomplete = resoudre;
  });
  connexion.close();
}

/** Ce que l'appareil porte à la place de l'identifiant de l'espace local, lu sans le module. */
export async function identifiantInscrit(): Promise<unknown> {
  const connexion = await attendre(indexedDB.open(BASE_DE_L_APPAREIL));
  const lue: unknown = await attendre(
    connexion
      .transaction(MAGASIN_DES_REGLAGES)
      .objectStore(MAGASIN_DES_REGLAGES)
      .get(CLE_DE_L_ESPACE_LOCAL),
  );
  connexion.close();
  return lue;
}

/** Toute demande d'ouverture de cette base lève ; les autres bases s'ouvrent. */
export function refuserLOuvertureDe(nomRefuse: string): void {
  const ouvrir = indexedDB.open.bind(indexedDB);
  vi.spyOn(indexedDB, "open").mockImplementation((nom, version) => {
    if (nom === nomRefuse) {
      throw new DOMException("refus", "UnknownError");
    }
    return ouvrir(nom, version);
  });
}
