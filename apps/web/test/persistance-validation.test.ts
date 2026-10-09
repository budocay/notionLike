// Chaque mise à jour est écrite une fois, dans une transaction validée par `commit()` aussitôt la
// demande posée. `fake-indexeddb` ne décharge aucune page : que l'écriture survive à un
// rechargement immédiat se prouve dans Chromium (`e2e/arborescence.spec.ts`), pas ici.
import { describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

import { ouvrirPersistance, type Persistance } from "../src/persistance/index.ts";
import { PAGE_P } from "./aides-identifiants.ts";
import {
  attendreEtat,
  enregistrements,
  ESPACE_A,
  laisserIndexedDbTravailler,
} from "./aides-persistance.ts";

const PAGE = { type: "page", idEspace: ESPACE_A, idPage: PAGE_P } as const;
const BASE_DE_LA_PAGE = `notionlike:page:${ESPACE_A}:${PAGE_P}`;
const DOCUMENT_VIDE = [0, 0];
const SEUIL_DE_COMPACTAGE = 500;
const DELAI_DE_COMPACTAGE_MS = 1_000;

async function ouvrirEtAttendre(doc: Y.Doc): Promise<Persistance> {
  const persistance = ouvrirPersistance(doc, PAGE);
  await attendreEtat(persistance, "active");
  return persistance;
}

function ecrire(doc: Y.Doc, nombre: number): void {
  for (let rang = 0; rang < nombre; rang += 1) {
    doc.getArray<string>("lignes").push([`ligne ${String(rang)}`]);
  }
}

function misesAJourEmises(doc: Y.Doc): number[][] {
  const emises: number[][] = [];
  doc.on("update", (miseAJour: Uint8Array) => emises.push([...miseAJour]));
  return emises;
}

async function relireDansUnDocumentVierge(): Promise<Y.Doc> {
  const relu = new Y.Doc();
  (await ouvrirEtAttendre(relu)).fermer();
  return relu;
}

function etat(doc: Y.Doc): number[] {
  return [...Y.encodeStateAsUpdate(doc)];
}

describe("validation de chaque écriture", () => {
  it("F-002-AC2 chaque mise à jour est écrite une fois et une seule, à l'identique et dans l'ordre", async () => {
    const doc = new Y.Doc();
    const persistance = await ouvrirEtAttendre(doc);
    const emises = misesAJourEmises(doc);

    ecrire(doc, 3);
    await laisserIndexedDbTravailler();
    persistance.fermer();

    expect(emises).toHaveLength(3);
    expect(await enregistrements(BASE_DE_LA_PAGE)).toEqual([DOCUMENT_VIDE, ...emises]);
  });

  it("F-002-AC2 la transaction de chaque mise à jour est validée dès l'écriture, celles de la relecture ne le sont pas", async () => {
    const validations = vi.spyOn(IDBTransaction.prototype, "commit");
    const doc = new Y.Doc();
    const persistance = await ouvrirEtAttendre(doc);
    await laisserIndexedDbTravailler();
    expect(validations).not.toHaveBeenCalled();

    ecrire(doc, 1);
    expect(validations).toHaveBeenCalledTimes(1);
    ecrire(doc, 2);
    expect(validations).toHaveBeenCalledTimes(3);
    await laisserIndexedDbTravailler();

    const validees = validations.mock.contexts as IDBTransaction[];
    expect(validees.map((transaction) => transaction.mode)).toEqual(Array(3).fill("readwrite"));
    expect(validees.map((transaction) => [...transaction.objectStoreNames])).toEqual(
      Array(3).fill(["updates"]),
    );
    expect(new Set(validees).size).toBe(3);
    expect(persistance.etat()).toBe("active");
  });

  it("F-002-AC2 la connexion retrouve sa méthode d'origine après chaque écriture", async () => {
    const connexions: IDBDatabase[] = [];
    const ouvrir = indexedDB.open.bind(indexedDB);
    vi.spyOn(indexedDB, "open").mockImplementation((nom, version) => {
      const demande = ouvrir(nom, version);
      demande.addEventListener("success", () => connexions.push(demande.result));
      return demande;
    });
    const doc = new Y.Doc();
    await ouvrirEtAttendre(doc);

    ecrire(doc, 2);

    expect(connexions).toHaveLength(1);
    expect(Object.hasOwn(connexions[0] as IDBDatabase, "transaction")).toBe(false);
  });

  it("F-002-AC2 sans `commit` dans le navigateur, l'écriture ne lève pas et la mise à jour est quand même enregistrée", async () => {
    const commit = Object.getOwnPropertyDescriptor(IDBTransaction.prototype, "commit");
    expect(commit).toBeDefined();
    Reflect.deleteProperty(IDBTransaction.prototype, "commit");
    try {
      const doc = new Y.Doc();
      const persistance = await ouvrirEtAttendre(doc);
      const emises = misesAJourEmises(doc);

      expect(() => ecrire(doc, 2)).not.toThrow();
      await laisserIndexedDbTravailler();

      expect(persistance.etat()).toBe("active");
      expect(await enregistrements(BASE_DE_LA_PAGE)).toEqual([DOCUMENT_VIDE, ...emises]);
    } finally {
      Object.defineProperty(IDBTransaction.prototype, "commit", commit as PropertyDescriptor);
    }
  });

  it("F-002-AC16 un `commit` qui lève, la transaction étant déjà terminée par le moteur, ne s'échappe pas dans l'écriture du document", async () => {
    const doc = new Y.Doc();
    const persistance = await ouvrirEtAttendre(doc);
    const validations = vi.spyOn(IDBTransaction.prototype, "commit").mockImplementation(() => {
      throw new DOMException("The transaction has finished.", "InvalidStateError");
    });
    const emises = misesAJourEmises(doc);

    expect(() => ecrire(doc, 2)).not.toThrow();
    await laisserIndexedDbTravailler();

    expect(validations).toHaveBeenCalledTimes(2);
    expect(persistance.etat()).toBe("active");
    expect(await enregistrements(BASE_DE_LA_PAGE)).toEqual([DOCUMENT_VIDE, ...emises]);
  });

  it("F-002-AC2 une mise à jour appliquée par la relecture n'est pas réécrite dans la base", async () => {
    const original = new Y.Doc();
    const persistance = await ouvrirEtAttendre(original);
    ecrire(original, 2);
    await laisserIndexedDbTravailler();
    persistance.fermer();
    const avant = await enregistrements(BASE_DE_LA_PAGE);

    const relu = await relireDansUnDocumentVierge();
    await laisserIndexedDbTravailler();

    expect(etat(relu)).toEqual(etat(original));
    expect(await enregistrements(BASE_DE_LA_PAGE)).toEqual([...avant, DOCUMENT_VIDE]);
  });
});

describe("format stocké", () => {
  it("F-002-AC20 ce qui est écrit se relit par `Y.applyUpdate` seul, au format V1, à l'identique octet pour octet", async () => {
    const original = new Y.Doc();
    const persistance = await ouvrirEtAttendre(original);
    ecrire(original, 5);
    original.getMap("reglages").set("titre", "Écrit puis relu");
    await laisserIndexedDbTravailler();
    persistance.fermer();

    const autreClient = new Y.Doc();
    for (const enregistrement of await enregistrements(BASE_DE_LA_PAGE)) {
      Y.applyUpdate(autreClient, Uint8Array.from(enregistrement));
    }

    expect(etat(autreClient)).toEqual(etat(original));
    expect(etat(await relireDansUnDocumentVierge())).toEqual(etat(original));
  });

  it("F-002-AC20 une base écrite sans validation explicite, magasins `updates` et `custom`, se relit à l'identique", async () => {
    const ancien = new Y.Doc();
    const emises = misesAJourEmises(ancien);
    ecrire(ancien, 3);
    await new Promise<void>((resoudre) => {
      const demande = indexedDB.open(BASE_DE_LA_PAGE);
      demande.onupgradeneeded = () => {
        demande.result.createObjectStore("updates", { autoIncrement: true });
        demande.result.createObjectStore("custom");
      };
      demande.onsuccess = () => {
        const transaction = demande.result.transaction("updates", "readwrite");
        emises.forEach((miseAJour) =>
          transaction.objectStore("updates").add(Uint8Array.from(miseAJour)),
        );
        transaction.oncomplete = () => {
          demande.result.close();
          resoudre();
        };
      };
    });

    expect(etat(await relireDansUnDocumentVierge())).toEqual(etat(ancien));
  });
});

describe("compactage du journal", () => {
  it("F-002-AC2 au seuil de la bibliothèque, le journal est réduit à un enregistrement qui se relit à l'identique", async () => {
    const doc = new Y.Doc();
    const persistance = await ouvrirEtAttendre(doc);
    await laisserIndexedDbTravailler();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

    ecrire(doc, SEUIL_DE_COMPACTAGE);
    await laisserIndexedDbTravailler();
    expect(await enregistrements(BASE_DE_LA_PAGE)).toHaveLength(SEUIL_DE_COMPACTAGE + 1);
    vi.advanceTimersByTime(DELAI_DE_COMPACTAGE_MS);
    await laisserIndexedDbTravailler();

    expect(await enregistrements(BASE_DE_LA_PAGE)).toEqual([etat(doc)]);
    ecrire(doc, 1);
    await laisserIndexedDbTravailler();
    expect(await enregistrements(BASE_DE_LA_PAGE)).toHaveLength(2);
    expect(persistance.etat()).toBe("active");
    persistance.fermer();
    vi.useRealTimers();
    expect(etat(await relireDansUnDocumentVierge())).toEqual(etat(doc));
  });
});
