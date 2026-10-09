import { ouvrirDocumentEspace } from "@notionlike/document";
import { describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

import { ouvrirEspaceLocal, ouvrirPersistance } from "../src/persistance/index.ts";
import {
  attendreEtat,
  enregistrements,
  ESPACE_A,
  ESPACE_B,
  fermerDeForce,
  laisserIndexedDbTravailler,
  nomsDesBases,
  refuserLesOuverturesParUneErreur,
  refuserLesOuverturesParUneException,
  retenirLesOuvertures,
  suivreLesConnexions,
} from "./aides-persistance.ts";

const ESPACE = { type: "espace", idEspace: ESPACE_A } as const;
const BASE_DE_L_ESPACE = `notionlike:espace:${ESPACE_A}`;
const CLE_DEJA_PRISE = 1;
const JUSTE_AVANT_L_ECHEANCE_MS = 9_999;

function titresALaRacine(doc: Y.Doc): string[] {
  return ouvrirDocumentEspace(doc)
    .lire()
    .racines.map((page) => page.titre);
}

async function enregistrerUnePage(titre: string): Promise<void> {
  const facade = ouvrirDocumentEspace(new Y.Doc());
  const persistance = ouvrirPersistance(facade.doc, ESPACE);
  await attendreEtat(persistance, "active");
  facade.creerPage(titre);
  persistance.fermer();
}

// Une vraie erreur de contrainte : elle parcourt la base, la transaction et la demande.
function faireEchouerLesEcritures() {
  const ajouter = IDBObjectStore.prototype.add;
  return vi.spyOn(IDBObjectStore.prototype, "add").mockImplementation(function (
    this: IDBObjectStore,
    valeur: unknown,
  ) {
    return ajouter.call(this, valeur, CLE_DEJA_PRISE);
  });
}

function faireEchouerLesLectures(): void {
  const ajouter = IDBObjectStore.prototype.add;
  vi.spyOn(IDBObjectStore.prototype, "getAll").mockImplementation(function (this: IDBObjectStore) {
    return ajouter.call(this, new Uint8Array(), CLE_DEJA_PRISE) as unknown as IDBRequest<unknown[]>;
  });
}

// Un quota dépassé est constaté par le moteur : c'est lui qui annule la transaction, que le script
// l'ait déjà validée par `commit()` ou non. Un `abort()` appelé par le script après `commit()`
// lèverait `InvalidStateError` ; l'annulation passe donc par le chemin interne de `fake-indexeddb`.
interface TransactionSimulee {
  _abort(nomDeLErreur: string): void;
}

function annulerLesTransactionsApresEcriture(): void {
  const ajouter = IDBObjectStore.prototype.add;
  vi.spyOn(IDBObjectStore.prototype, "add").mockImplementation(function (
    this: IDBObjectStore,
    valeur: unknown,
  ) {
    const demande = ajouter.call(this, valeur);
    const transaction = this.transaction as unknown as TransactionSimulee;
    demande.addEventListener("success", () => transaction._abort("QuotaExceededError"));
    return demande;
  });
}

describe("IndexedDB indisponible", () => {
  it("F-002-AC16 sans indexedDB, la persistance est coupée dès le retour de l'appel et le document reste modifiable en mémoire", async () => {
    Reflect.deleteProperty(globalThis, "indexedDB");
    expect(typeof indexedDB).toBe("undefined");
    const facade = ouvrirDocumentEspace(new Y.Doc());
    const abonne = vi.fn();

    const persistance = ouvrirPersistance(facade.doc, ESPACE);
    persistance.abonner(abonne);
    const espaceLocal = ouvrirEspaceLocal(new Y.Doc(), ESPACE_B);

    expect(persistance.etat()).toBe("coupee");
    expect(espaceLocal.etat()).toBe("coupee");
    expect(espaceLocal.idEspace()).toBe(ESPACE_B);
    facade.creerPage("En mémoire");
    expect(facade.lire().racines.map((page) => page.titre)).toEqual(["En mémoire"]);
    await laisserIndexedDbTravailler();
    persistance.fermer();
    expect(persistance.etat()).toBe("coupee");
    expect(abonne).not.toHaveBeenCalled();
  });

  it("F-002-AC16 une ouverture refusée par une exception coupe la persistance sans créer de base", async () => {
    refuserLesOuverturesParUneException();

    const persistance = ouvrirPersistance(new Y.Doc(), ESPACE);
    const espaceLocal = ouvrirEspaceLocal(new Y.Doc(), ESPACE_B);

    expect(persistance.etat()).toBe("coupee");
    expect(espaceLocal.etat()).toBe("coupee");
    expect(espaceLocal.idEspace()).toBe(ESPACE_B);
    await laisserIndexedDbTravailler();
    expect(await nomsDesBases()).toEqual([]);
  });

  it("F-002-AC16 une ouverture refusée par une erreur de la demande coupe la persistance sans créer de base", async () => {
    refuserLesOuverturesParUneErreur();

    const persistance = ouvrirPersistance(new Y.Doc(), ESPACE);
    const espaceLocal = ouvrirEspaceLocal(new Y.Doc(), ESPACE_B);
    expect(persistance.etat()).toBe("relecture");
    await Promise.all([attendreEtat(persistance, "coupee"), attendreEtat(espaceLocal, "coupee")]);

    expect(espaceLocal.idEspace()).toBe(ESPACE_B);
    expect(await nomsDesBases()).toEqual([]);
  });

  it("F-002-AC16 un identifiant d'espace local illisible sur l'appareil coupe la persistance et garde le candidat", async () => {
    const premiere = ouvrirEspaceLocal(new Y.Doc(), ESPACE_A);
    await attendreEtat(premiere, "active");
    premiere.fermer();
    await new Promise((resoudre) => {
      const demande = indexedDB.open("notionlike:appareil");
      demande.onsuccess = () => {
        const transaction = demande.result.transaction("reglages", "readwrite");
        transaction.objectStore("reglages").put({ pas: "un identifiant" }, "espace-local");
        transaction.oncomplete = resoudre;
        demande.result.close();
      };
    });

    const espaceLocal = ouvrirEspaceLocal(new Y.Doc(), ESPACE_B);
    await attendreEtat(espaceLocal, "coupee");

    expect(espaceLocal.idEspace()).toBe(ESPACE_B);
    expect(await nomsDesBases()).toEqual(["notionlike:appareil", BASE_DE_L_ESPACE]);
  });
});

describe("lecture ou écriture en échec", () => {
  it("F-002-AC16 une écriture en échec coupe la persistance, n'écrit plus rien et laisse les pages lisibles en mémoire", async () => {
    const facade = ouvrirDocumentEspace(new Y.Doc());
    const persistance = ouvrirPersistance(facade.doc, ESPACE);
    await attendreEtat(persistance, "active");
    facade.creerPage("Enregistrée");
    const ecritures = faireEchouerLesEcritures();

    facade.creerPage("Refusée par la base");
    await attendreEtat(persistance, "coupee");
    await laisserIndexedDbTravailler();
    const ecrituresAvantLaSuite = ecritures.mock.calls.length;
    facade.creerPage("Après la coupure");
    await laisserIndexedDbTravailler();

    expect(ecritures).toHaveBeenCalledTimes(ecrituresAvantLaSuite);
    expect(facade.lire().racines.map((page) => page.titre)).toEqual([
      "Enregistrée",
      "Refusée par la base",
      "Après la coupure",
    ]);
    persistance.fermer();
    expect(persistance.etat()).toBe("coupee");
  });

  it("F-002-AC16 une lecture en échec pendant la relecture coupe la persistance et laisse le document vide", async () => {
    await enregistrerUnePage("Déjà enregistrée");
    faireEchouerLesLectures();
    const doc = new Y.Doc();

    const persistance = ouvrirPersistance(doc, ESPACE);
    await attendreEtat(persistance, "coupee");
    await laisserIndexedDbTravailler();

    expect(titresALaRacine(doc)).toEqual([]);
  });

  it("F-002-AC16 une transaction annulée après coup (quota) coupe la persistance sans erreur", async () => {
    const facade = ouvrirDocumentEspace(new Y.Doc());
    const persistance = ouvrirPersistance(facade.doc, ESPACE);
    await attendreEtat(persistance, "active");
    annulerLesTransactionsApresEcriture();

    facade.creerPage("Annulée par la base");
    await attendreEtat(persistance, "coupee");
    await laisserIndexedDbTravailler();

    expect(facade.lire().racines.map((page) => page.titre)).toEqual(["Annulée par la base"]);
  });

  it("F-002-AC16 une connexion fermée de façon anormale coupe la persistance, et l'écriture suivante ne lève pas", async () => {
    const connexions = suivreLesConnexions();
    const facade = ouvrirDocumentEspace(new Y.Doc());
    const persistance = ouvrirPersistance(facade.doc, ESPACE);
    await attendreEtat(persistance, "active");

    expect(connexions).toHaveLength(1);
    fermerDeForce(connexions[0] as IDBDatabase);
    await attendreEtat(persistance, "coupee");

    expect(() => facade.creerPage("Après la fermeture")).not.toThrow();
    await laisserIndexedDbTravailler();
  });
});

describe("échéance de la relecture", () => {
  it("F-002-AC24 une ouverture sans réponse laisse « relecture » à 9 999 ms et coupe à 10 000 ms ; la réponse tardive ne lit ni n'écrit rien", async () => {
    await enregistrerUnePage("Enregistrée avant");
    const avant = await enregistrements(BASE_DE_L_ESPACE);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const ouvertures = retenirLesOuvertures();
    const facade = ouvrirDocumentEspace(new Y.Doc());
    const abonne = vi.fn();

    const persistance = ouvrirPersistance(facade.doc, ESPACE);
    persistance.abonner(abonne);
    vi.advanceTimersByTime(JUSTE_AVANT_L_ECHEANCE_MS);
    await laisserIndexedDbTravailler();
    expect(persistance.etat()).toBe("relecture");
    vi.advanceTimersByTime(1);
    expect(persistance.etat()).toBe("coupee");
    expect(abonne).toHaveBeenCalledTimes(1);

    facade.creerPage("En mémoire");
    ouvertures.repondre();
    await laisserIndexedDbTravailler();

    expect(persistance.etat()).toBe("coupee");
    expect(facade.lire().racines.map((page) => page.titre)).toEqual(["En mémoire"]);
    ouvertures.cesser();
    expect(await enregistrements(BASE_DE_L_ESPACE)).toEqual(avant);
  });

  it("F-002-AC24 l'échéance couvre aussi l'ouverture faite par la bibliothèque après la sonde, et sa réponse tardive reste sans effet", async () => {
    await enregistrerUnePage("Enregistrée avant");
    const avant = await enregistrements(BASE_DE_L_ESPACE);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const ouvertures = retenirLesOuvertures(2);
    const facade = ouvrirDocumentEspace(new Y.Doc());

    const persistance = ouvrirPersistance(facade.doc, ESPACE);
    await laisserIndexedDbTravailler();
    vi.advanceTimersByTime(JUSTE_AVANT_L_ECHEANCE_MS);
    expect(persistance.etat()).toBe("relecture");
    vi.advanceTimersByTime(1);
    expect(persistance.etat()).toBe("coupee");

    facade.creerPage("En mémoire");
    ouvertures.repondre();
    await laisserIndexedDbTravailler();

    expect(facade.lire().racines.map((page) => page.titre)).toEqual(["En mémoire"]);
    ouvertures.cesser();
    expect(await enregistrements(BASE_DE_L_ESPACE)).toEqual(avant);
  });

  it("F-002-AC24 l'échéance couvre la base de l'appareil : sa réponse tardive n'inscrit aucun identifiant et ne crée aucune base", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const ouvertures = retenirLesOuvertures();

    const espaceLocal = ouvrirEspaceLocal(new Y.Doc(), ESPACE_B);
    vi.advanceTimersByTime(JUSTE_AVANT_L_ECHEANCE_MS);
    expect(espaceLocal.etat()).toBe("relecture");
    vi.advanceTimersByTime(1);
    expect(espaceLocal.etat()).toBe("coupee");

    ouvertures.repondre();
    await laisserIndexedDbTravailler();

    expect(espaceLocal.idEspace()).toBe(ESPACE_B);
    expect(await nomsDesBases()).toEqual([]);
  });

  it("F-002-AC24 une relecture aboutie désarme l'échéance : la persistance reste active au-delà de 10 secondes", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const persistance = ouvrirPersistance(new Y.Doc(), ESPACE);
    await attendreEtat(persistance, "active");

    vi.advanceTimersByTime(JUSTE_AVANT_L_ECHEANCE_MS + 1);

    expect(persistance.etat()).toBe("active");
    expect(vi.getTimerCount()).toBe(0);
  });
});
