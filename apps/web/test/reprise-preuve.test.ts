// F-030-AC26 : une persistance n'est active qu'une fois la preuve d'écriture faite. L'événement
// `synced` de la bibliothèque, émis même quand l'écriture de l'état complet échoue, n'y suffit pas.
import { describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

import { ouvrirPersistance } from "../src/persistance/index.ts";
import {
  attendreEtat,
  enregistrements,
  ESPACE_A,
  laisserIndexedDbTravailler,
  suivreLesConnexionsTenues,
} from "./aides-persistance.ts";
import {
  annulerLesProchainsAjouts,
  demandeSansReponse,
  etatRelu,
  etatsSuccessifs,
  instancesAyantRelu,
  intercepterLesLecturesBrutes,
  perdreLesProchainsAjouts,
} from "./aides-reprise.ts";

const ESPACE = { type: "espace", idEspace: ESPACE_A } as const;
const BASE = `notionlike:espace:${ESPACE_A}`;
const JUSTE_AVANT_L_ECHEANCE_MS = 9_999;
// Rang de la lecture brute de la preuve : la seconde sur une base qui existe, après celle qui
// précède la construction de l'instance ; la seule sur une base absente, dont la première lecture
// annule la création sans rien lire.
const LECTURE_DE_LA_PREUVE = 2;
const LECTURE_DE_LA_PREUVE_SANS_BASE = 1;

function documentRempli(): Y.Doc {
  const doc = new Y.Doc();
  doc.getMap("temoin").set("a", "gardé");
  doc.getMap("temoin").set("b", "à retirer");
  return doc;
}

function etat(doc: Y.Doc): number[] {
  return [...Y.encodeStateAsUpdate(doc)];
}

async function enregistrer(doc: Y.Doc): Promise<void> {
  const persistance = ouvrirPersistance(doc, ESPACE);
  await attendreEtat(persistance, "active");
  persistance.fermer();
  await laisserIndexedDbTravailler();
}

describe("preuve d'écriture à l'ouverture", () => {
  it("F-030-AC26 (1) écriture de l'état complet annulée alors que `synced` est émis : l'état actif n'est jamais atteint, la base ne porte pas l'état en mémoire", async () => {
    const doc = documentRempli();
    const instances = instancesAyantRelu(doc);
    annulerLesProchainsAjouts(1);

    const persistance = ouvrirPersistance(doc, ESPACE);
    const etats = etatsSuccessifs(persistance);
    await attendreEtat(persistance, "coupee");
    await laisserIndexedDbTravailler();

    expect(instances.map((instance) => instance.synced)).toEqual([true]);
    expect(etats).toEqual(["coupee"]);
    expect(etatRelu(await enregistrements(BASE))).not.toEqual(etat(doc));
  });

  it("F-030-AC26 écriture de l'état complet perdue sans aucun événement de la connexion : la relecture de la base le voit, l'état actif n'est jamais atteint", async () => {
    const doc = documentRempli();
    const instances = instancesAyantRelu(doc);
    perdreLesProchainsAjouts(1);

    const persistance = ouvrirPersistance(doc, ESPACE);
    const etats = etatsSuccessifs(persistance);
    await attendreEtat(persistance, "coupee");
    await laisserIndexedDbTravailler();

    expect(instances.map((instance) => instance.synced)).toEqual([true]);
    expect(etats).toEqual(["coupee"]);
    expect(await enregistrements(BASE)).toEqual([]);
  });

  it("F-030-AC26 seule une suppression manque à la base, les vecteurs d'état sont égaux : la preuve échoue quand même", async () => {
    const doc = documentRempli();
    await enregistrer(doc);
    doc.getMap("temoin").delete("b");
    const temoin = new Y.Doc();
    (await enregistrements(BASE)).forEach((lu) => Y.applyUpdate(temoin, Uint8Array.from(lu)));
    expect([...Y.encodeStateVector(temoin)]).toEqual([...Y.encodeStateVector(doc)]);
    expect(temoin.getMap("temoin").has("b")).toBe(true);
    perdreLesProchainsAjouts(1);

    const persistance = ouvrirPersistance(doc, ESPACE);
    const etats = etatsSuccessifs(persistance);
    await attendreEtat(persistance, "coupee");

    expect(etats).toEqual(["coupee"]);
  });

  it("F-030-AC26 (3) écriture réussie : état actif après deux lectures brutes, et les enregistrements de la base sont les mêmes, en nombre et octet pour octet, avant et après la lecture de la preuve", async () => {
    await enregistrer(new Y.Doc());
    const avant = await enregistrements(BASE);
    const doc = documentRempli();
    const lusParLaPreuve: number[][][] = [];
    const lecturesFaites: number[] = [];
    intercepterLesLecturesBrutes((rang, lire) => {
      lecturesFaites.push(rang);
      const demande = lire();
      demande.addEventListener("success", () => {
        if (rang === LECTURE_DE_LA_PREUVE) {
          lusParLaPreuve.push((demande.result as Uint8Array[]).map((lu) => [...lu]));
        }
      });
      return demande;
    });
    const ecritures = vi.spyOn(IDBObjectStore.prototype, "add");
    const remplacements = vi.spyOn(IDBObjectStore.prototype, "put");
    const retraits = vi.spyOn(IDBObjectStore.prototype, "delete");

    const persistance = ouvrirPersistance(doc, ESPACE);
    const lecturesALActivation: number[] = [];
    persistance.abonner(() => lecturesALActivation.push(lecturesFaites.length));
    expect(persistance.lireEtat()).toBe("relecture");
    await attendreEtat(persistance, "active");
    await laisserIndexedDbTravailler();
    vi.restoreAllMocks();

    expect(lecturesALActivation).toEqual([LECTURE_DE_LA_PREUVE]);
    expect(avant).toEqual([[0, 0]]);
    expect(lusParLaPreuve).toEqual([[...avant, etat(doc)]]);
    expect(await enregistrements(BASE)).toEqual(lusParLaPreuve[0]);
    expect(ecritures).toHaveBeenCalledTimes(1);
    expect(remplacements).not.toHaveBeenCalled();
    expect(retraits).not.toHaveBeenCalled();
  });

  it("F-030-AC26 F-030-AC17 une modification faite pendant la preuve ne la fait pas échouer et est écrite par l'instance", async () => {
    const doc = documentRempli();
    intercepterLesLecturesBrutes((rang, lire) => {
      if (rang === LECTURE_DE_LA_PREUVE_SANS_BASE) {
        doc.getMap("temoin").set("c", "pendant la preuve");
      }
      return lire();
    });

    const persistance = ouvrirPersistance(doc, ESPACE);
    const etats = etatsSuccessifs(persistance);
    await attendreEtat(persistance, "active");
    await laisserIndexedDbTravailler();
    vi.restoreAllMocks();

    expect(etats).toEqual(["active"]);
    expect(doc.getMap("temoin").get("c")).toBe("pendant la preuve");
    expect(etatRelu(await enregistrements(BASE))).toEqual(etat(doc));
  });

  it("F-030-AC26 lecture brute de la preuve en échec : coupure, jamais d'état actif", async () => {
    const doc = documentRempli();
    intercepterLesLecturesBrutes((rang, lire) => {
      const demande = lire();
      if (rang === LECTURE_DE_LA_PREUVE_SANS_BASE) {
        demande.transaction?.abort();
      }
      return demande;
    });

    const persistance = ouvrirPersistance(doc, ESPACE);
    const etats = etatsSuccessifs(persistance);
    await attendreEtat(persistance, "coupee");
    await laisserIndexedDbTravailler();

    expect(etats).toEqual(["coupee"]);
  });

  it("F-030-AC26 lecture brute de la preuve sans réponse : relecture jusqu'à 9 999 ms, coupure à 10 000 ms, l'échéance couvre la preuve", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const connexions = suivreLesConnexionsTenues();
    const doc = documentRempli();
    const instances = instancesAyantRelu(doc);
    intercepterLesLecturesBrutes((rang, lire) =>
      rang === LECTURE_DE_LA_PREUVE_SANS_BASE ? demandeSansReponse() : lire(),
    );

    const persistance = ouvrirPersistance(doc, ESPACE);
    const etats = etatsSuccessifs(persistance);
    await laisserIndexedDbTravailler();
    vi.advanceTimersByTime(JUSTE_AVANT_L_ECHEANCE_MS);
    expect(instances.map((instance) => instance.synced)).toEqual([true]);
    expect(persistance.lireEtat()).toBe("relecture");
    expect(connexions).toHaveLength(2);
    vi.advanceTimersByTime(1);
    await laisserIndexedDbTravailler();

    expect(etats).toEqual(["coupee"]);
    expect(connexions).toEqual([]);
    // Seule reste armée l'attente de la tentative suivante (F-030-AC1).
    expect(vi.getTimerCount()).toBe(1);
    persistance.fermer();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("F-030-AC26 la lecture de la preuve ne part qu'après une transaction de barrière en lecture seule, ouverte sur le magasin par la connexion de l'instance, et finie", async () => {
    const ouvrirUneTransaction = IDBDatabase.prototype.transaction;
    const journal: string[] = [];
    const barrieres: IDBTransaction[] = [];
    vi.spyOn(IDBDatabase.prototype, "transaction").mockImplementation(function (
      this: IDBDatabase,
      ...arguments_: Parameters<typeof ouvrirUneTransaction>
    ) {
      const transaction = ouvrirUneTransaction.apply(this, arguments_);
      if (transaction.mode === "readonly" && barrieres.length === 0) {
        barrieres.push(transaction);
        journal.push("barrière ouverte");
        transaction.addEventListener("complete", () => journal.push("barrière finie"));
      }
      return transaction;
    });
    const ecritures: IDBTransaction[] = [];
    const ajouter = IDBObjectStore.prototype.add;
    vi.spyOn(IDBObjectStore.prototype, "add").mockImplementation(function (
      this: IDBObjectStore,
      valeur: unknown,
    ) {
      ecritures.push(this.transaction);
      journal.push("état complet demandé");
      return ajouter.call(this, valeur);
    });
    intercepterLesLecturesBrutes((_rang, lire) => {
      journal.push("lecture de la preuve");
      return lire();
    });

    const persistance = ouvrirPersistance(documentRempli(), ESPACE);
    await attendreEtat(persistance, "active");

    expect(journal).toEqual([
      "état complet demandé",
      "barrière ouverte",
      "barrière finie",
      "lecture de la preuve",
    ]);
    expect([...(barrieres[0] as IDBTransaction).objectStoreNames]).toEqual(["updates"]);
    expect((barrieres[0] as IDBTransaction).db).toBe((ecritures[0] as IDBTransaction).db);
  });
});
