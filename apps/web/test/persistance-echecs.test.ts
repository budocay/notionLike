import { describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

import { ouvrirEspaceLocal, ouvrirPersistance } from "../src/persistance/index.ts";
import { ouvrirFacade } from "./aides-facade.ts";
import { ecrireLaVersion, VERSION_NON_PRISE_EN_CHARGE } from "./aides-format.ts";
import { UUID_AVEC_LETTRES } from "./aides-identifiants.ts";
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
  suivreLesConnexionsTenues,
} from "./aides-persistance.ts";

const ESPACE = { type: "espace", idEspace: ESPACE_A } as const;
const BASE_DE_L_ESPACE = `notionlike:espace:${ESPACE_A}`;
const BASE_DE_L_APPAREIL = "notionlike:appareil";
const MAGASIN_DES_REGLAGES = "reglages";
const CLE_DE_L_ESPACE_LOCAL = "espace-local";
const CLE_DEJA_PRISE = 1;
const JUSTE_AVANT_L_ECHEANCE_MS = 9_999;
// Ce que `y-indexeddb@9.0.12` écrit à chaque ouverture, avant de relire (F-002-AC17, H15).
const ENREGISTREMENT_VIDE = [0, 0];

function titresALaRacine(doc: Y.Doc): string[] {
  return ouvrirFacade(doc)
    .lire()
    .racines.map((page) => page.titre);
}

async function enregistrerUnePage(titre: string): Promise<void> {
  const facade = ouvrirFacade(new Y.Doc());
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

// Ce que l'appareil a conservé comme identifiant de l'espace local, lu et écrit sans le module.
function ouvrirLaBaseDeLAppareil(): Promise<IDBDatabase> {
  return new Promise((resoudre, rejeter) => {
    const demande = indexedDB.open(BASE_DE_L_APPAREIL, 1);
    demande.onupgradeneeded = () => demande.result.createObjectStore(MAGASIN_DES_REGLAGES);
    demande.onsuccess = () => resoudre(demande.result);
    demande.onerror = () => rejeter(demande.error ?? new Error("ouverture en échec"));
  });
}

async function inscrireSurLAppareil(valeur: unknown): Promise<void> {
  const connexion = await ouvrirLaBaseDeLAppareil();
  await new Promise((resoudre) => {
    const transaction = connexion.transaction(MAGASIN_DES_REGLAGES, "readwrite");
    transaction.objectStore(MAGASIN_DES_REGLAGES).put(valeur, CLE_DE_L_ESPACE_LOCAL);
    transaction.oncomplete = resoudre;
  });
  connexion.close();
}

async function lireSurLAppareil(): Promise<unknown> {
  const connexion = await ouvrirLaBaseDeLAppareil();
  const lue = await new Promise((resoudre) => {
    const lecture = connexion
      .transaction(MAGASIN_DES_REGLAGES)
      .objectStore(MAGASIN_DES_REGLAGES)
      .get(CLE_DE_L_ESPACE_LOCAL);
    lecture.onsuccess = () => resoudre(lecture.result);
  });
  connexion.close();
  return lue;
}

describe("IndexedDB indisponible", () => {
  it("F-002-AC16 (a) sans indexedDB, la persistance est coupée dès le retour de l'appel et le document reste modifiable en mémoire", async () => {
    Reflect.deleteProperty(globalThis, "indexedDB");
    expect(typeof indexedDB).toBe("undefined");
    const facade = ouvrirFacade(new Y.Doc());
    const abonne = vi.fn();

    const persistance = ouvrirPersistance(facade.doc, ESPACE);
    persistance.abonner(abonne);
    const espaceLocal = ouvrirEspaceLocal(new Y.Doc(), ESPACE_B);

    expect(persistance.lireEtat()).toBe("coupee");
    expect(espaceLocal.lireEtat()).toBe("coupee");
    facade.creerPage("En mémoire");
    expect(facade.lire().racines.map((page) => page.titre)).toEqual(["En mémoire"]);
    await laisserIndexedDbTravailler();
    // Depuis F-030 : la première modification faite pendant la coupure est diffusée, parce qu'elle
    // n'est pas enregistrée (F-030-AC16) ; la coupure n'est plus définitive, la fermeture l'est
    // (F-030-AC11).
    expect(abonne).toHaveBeenCalledTimes(1);
    expect(persistance.lireEtat()).toBe("coupee");
    persistance.fermer();
    expect(persistance.lireEtat()).toBe("fermee");
    expect(abonne).toHaveBeenCalledTimes(2);
  });

  it("F-002-AC16 (b) une ouverture refusée par une exception levée à la demande coupe la persistance sans créer de base", async () => {
    refuserLesOuverturesParUneException();

    const persistance = ouvrirPersistance(new Y.Doc(), ESPACE);
    const espaceLocal = ouvrirEspaceLocal(new Y.Doc(), ESPACE_B);

    expect(persistance.lireEtat()).toBe("coupee");
    expect(espaceLocal.lireEtat()).toBe("coupee");
    await laisserIndexedDbTravailler();
    expect(await nomsDesBases()).toEqual([]);
  });

  it("F-002-AC16 (b) une ouverture refusée par une erreur de la demande coupe la persistance sans créer de base", async () => {
    refuserLesOuverturesParUneErreur();

    const persistance = ouvrirPersistance(new Y.Doc(), ESPACE);
    const espaceLocal = ouvrirEspaceLocal(new Y.Doc(), ESPACE_B);
    expect(persistance.lireEtat()).toBe("relecture");
    await Promise.all([attendreEtat(persistance, "coupee"), attendreEtat(espaceLocal, "coupee")]);

    expect(await nomsDesBases()).toEqual([]);
  });
});

describe("identifiant de l'espace local relu sur l'appareil", () => {
  it.each<readonly [string, unknown]>([
    ["un objet", { pas: "un identifiant" }],
    ["un nombre", 42],
    ["la valeur nulle", null],
    ["une chaîne vide", ""],
    ["un UUID en majuscules", UUID_AVEC_LETTRES.toUpperCase()],
    ["un UUID suivi de « :page »", `${UUID_AVEC_LETTRES}:page`],
    ["une chaîne de plusieurs milliers de caractères", UUID_AVEC_LETTRES.repeat(200)],
  ])(
    "F-002-AC28 F-030-AC23 si l'appareil a conservé %s à la place de l'identifiant, aucun nom de base n'en est tiré : la valeur est remplacée par le candidat, dont la base est la seule base d'espace ouverte ou créée",
    async (_cas, illisible) => {
      await inscrireSurLAppareil(illisible);
      const facade = ouvrirFacade(new Y.Doc());

      // Depuis F-030, une valeur illisible ne coupe plus la persistance à chaque lancement : elle
      // est remplacée (F-030-AC23). Ce que F-002-AC28 interdit reste interdit.
      const espaceLocal = ouvrirEspaceLocal(facade.doc, ESPACE_B);
      expect(espaceLocal.lireEtat()).toBe("relecture");
      await attendreEtat(espaceLocal, "active");
      facade.creerPage("Enregistrée");
      await laisserIndexedDbTravailler();

      expect(facade.lire().racines.map((page) => page.titre)).toEqual(["Enregistrée"]);
      expect(await nomsDesBases()).toEqual([BASE_DE_L_APPAREIL, `notionlike:espace:${ESPACE_B}`]);
      expect(await lireSurLAppareil()).toEqual(ESPACE_B);
    },
  );

  it("F-002-AC16 (b) F-030-AC24 une base de l'appareil sans son magasin de réglages est réparée sans erreur : le candidat est inscrit, et sa base est la seule base d'espace", async () => {
    await new Promise((resoudre) => {
      const demande = indexedDB.open(BASE_DE_L_APPAREIL, 1);
      demande.onsuccess = () => {
        demande.result.close();
        resoudre(undefined);
      };
    });

    // Depuis F-030, le magasin est recréé au lieu de couper la persistance (F-030-AC24).
    const espaceLocal = ouvrirEspaceLocal(new Y.Doc(), ESPACE_B);
    await attendreEtat(espaceLocal, "active");
    await laisserIndexedDbTravailler();

    expect(await nomsDesBases()).toEqual([BASE_DE_L_APPAREIL, `notionlike:espace:${ESPACE_B}`]);
  });

  it("F-002-AC28 un UUID canonique relu sur l'appareil nomme la base de l'espace, à la place du candidat", async () => {
    await inscrireSurLAppareil(ESPACE_A);

    const espaceLocal = ouvrirEspaceLocal(new Y.Doc(), ESPACE_B);
    await attendreEtat(espaceLocal, "active");

    expect(await nomsDesBases()).toEqual([BASE_DE_L_APPAREIL, BASE_DE_L_ESPACE]);
  });
});

describe("lecture ou écriture en échec après l'ouverture", () => {
  it("F-002-AC16 (c) une écriture en échec coupe la persistance, n'écrit plus rien et laisse les pages lisibles en mémoire", async () => {
    const facade = ouvrirFacade(new Y.Doc());
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
    // Depuis F-030, la coupure n'est plus définitive : seule la fermeture l'est (F-030-AC11).
    persistance.fermer();
    expect(persistance.lireEtat()).toBe("fermee");
  });

  it("F-002-AC16 (c) une lecture en échec pendant la relecture coupe la persistance et laisse le document vide", async () => {
    await enregistrerUnePage("Déjà enregistrée");
    faireEchouerLesLectures();
    const doc = new Y.Doc();

    const persistance = ouvrirPersistance(doc, ESPACE);
    await attendreEtat(persistance, "coupee");
    await laisserIndexedDbTravailler();

    expect(titresALaRacine(doc)).toEqual([]);
  });

  it("F-002-AC16 (c) une transaction annulée après coup (quota) coupe la persistance sans erreur", async () => {
    const facade = ouvrirFacade(new Y.Doc());
    const persistance = ouvrirPersistance(facade.doc, ESPACE);
    await attendreEtat(persistance, "active");
    annulerLesTransactionsApresEcriture();

    facade.creerPage("Annulée par la base");
    await attendreEtat(persistance, "coupee");
    await laisserIndexedDbTravailler();

    expect(facade.lire().racines.map((page) => page.titre)).toEqual(["Annulée par la base"]);
  });

  it("F-002-AC16 (c) une connexion fermée par le navigateur coupe la persistance, et l'écriture suivante ne lève pas", async () => {
    const connexions = suivreLesConnexionsTenues();
    const facade = ouvrirFacade(new Y.Doc());
    const persistance = ouvrirPersistance(facade.doc, ESPACE);
    await attendreEtat(persistance, "active");

    expect(connexions).toHaveLength(1);
    fermerDeForce(connexions[0] as IDBDatabase);
    await attendreEtat(persistance, "coupee");

    expect(() => facade.creerPage("Après la fermeture")).not.toThrow();
    await laisserIndexedDbTravailler();
  });
});

describe("document de version non prise en charge", () => {
  function etatRelu(lus: number[][]): number[] {
    const doc = new Y.Doc();
    lus.forEach((enregistrement) => Y.applyUpdate(doc, Uint8Array.from(enregistrement)));
    return [...Y.encodeStateAsUpdate(doc)];
  }

  it("F-002-AC17 ouvrir la base d'un document de version non prise en charge, puis fermer la persistance dès le refus, n'y ajoute que l'enregistrement vide de deux octets : l'état relu reste identique octet pour octet", async () => {
    const ancien = ouvrirFacade(new Y.Doc());
    const premiere = ouvrirPersistance(ancien.doc, ESPACE);
    await attendreEtat(premiere, "active");
    ancien.creerPage("Écrite par une version plus récente");
    ecrireLaVersion(ancien.doc, VERSION_NON_PRISE_EN_CHARGE);
    await laisserIndexedDbTravailler();
    premiere.fermer();
    const avant = await enregistrements(BASE_DE_L_ESPACE);

    const facade = ouvrirFacade(new Y.Doc());
    const persistance = ouvrirPersistance(facade.doc, ESPACE);
    await attendreEtat(persistance, "active");
    expect(() => facade.lire()).toThrow(
      expect.objectContaining({ code: "version-non-prise-en-charge" }),
    );
    persistance.fermer();
    facade.doc.getMap("temoin").set("contenu", "après le refus");
    await laisserIndexedDbTravailler();
    const apres = await enregistrements(BASE_DE_L_ESPACE);

    expect(persistance.lireEtat()).toBe("fermee");
    expect(avant.filter((enregistrement) => enregistrement.length > 2).length).toBeGreaterThan(0);
    expect(apres).toEqual([...avant, ENREGISTREMENT_VIDE]);
    expect(etatRelu(apres)).toEqual(etatRelu(avant));
  });
});

describe("échéance de la relecture", () => {
  it("F-002-AC24 une ouverture sans réponse laisse « relecture » à 9 999 ms et coupe à 10 000 ms ; rien de ce que la réponse tardive lit n'est appliqué au document ni écrit dans la base", async () => {
    await enregistrerUnePage("Enregistrée avant");
    const avant = await enregistrements(BASE_DE_L_ESPACE);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const ouvertures = retenirLesOuvertures();
    const facade = ouvrirFacade(new Y.Doc());
    const abonne = vi.fn();

    const persistance = ouvrirPersistance(facade.doc, ESPACE);
    persistance.abonner(abonne);
    vi.advanceTimersByTime(JUSTE_AVANT_L_ECHEANCE_MS);
    await laisserIndexedDbTravailler();
    expect(persistance.lireEtat()).toBe("relecture");
    vi.advanceTimersByTime(1);
    expect(persistance.lireEtat()).toBe("coupee");
    expect(abonne).toHaveBeenCalledTimes(1);

    facade.creerPage("En mémoire");
    ouvertures.repondre();
    await laisserIndexedDbTravailler();

    expect(persistance.lireEtat()).toBe("coupee");
    expect(facade.lire().racines.map((page) => page.titre)).toEqual(["En mémoire"]);
    ouvertures.cesser();
    expect(await enregistrements(BASE_DE_L_ESPACE)).toEqual(avant);
  });

  it("F-002-AC24 l'échéance couvre aussi l'ouverture faite par la bibliothèque après la sonde, et rien de sa réponse tardive n'est appliqué ni écrit", async () => {
    await enregistrerUnePage("Enregistrée avant");
    const avant = await enregistrements(BASE_DE_L_ESPACE);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const ouvertures = retenirLesOuvertures(2);
    const facade = ouvrirFacade(new Y.Doc());

    const persistance = ouvrirPersistance(facade.doc, ESPACE);
    await laisserIndexedDbTravailler();
    vi.advanceTimersByTime(JUSTE_AVANT_L_ECHEANCE_MS);
    expect(persistance.lireEtat()).toBe("relecture");
    vi.advanceTimersByTime(1);
    expect(persistance.lireEtat()).toBe("coupee");

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
    expect(espaceLocal.lireEtat()).toBe("relecture");
    vi.advanceTimersByTime(1);
    expect(espaceLocal.lireEtat()).toBe("coupee");

    ouvertures.repondre();
    await laisserIndexedDbTravailler();

    expect(await nomsDesBases()).toEqual([]);
  });

  it("F-002-AC24 l'échéance tombée entre l'ouverture de la base de l'appareil et la lecture de l'identifiant : le candidat n'est pas inscrit, aucune base d'espace n'est créée", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    // La lecture est demandée dans le tour même où l'ouverture aboutit, et sa réponse vient au
    // tour suivant : l'échéance est avancée entre les deux.
    const lire = IDBObjectStore.prototype.get;
    const lectures = vi.spyOn(IDBObjectStore.prototype, "get").mockImplementation(function (
      this: IDBObjectStore,
      cle: IDBValidKey | IDBKeyRange,
    ) {
      vi.advanceTimersByTime(JUSTE_AVANT_L_ECHEANCE_MS + 1);
      return lire.call(this, cle);
    });

    const espaceLocal = ouvrirEspaceLocal(new Y.Doc(), ESPACE_B);
    expect(espaceLocal.lireEtat()).toBe("relecture");
    await attendreEtat(espaceLocal, "coupee");
    await laisserIndexedDbTravailler();

    expect(lectures).toHaveBeenCalledTimes(1);
    lectures.mockRestore();
    expect(await lireSurLAppareil()).toBeUndefined();
    expect(await nomsDesBases()).toEqual([BASE_DE_L_APPAREIL]);
  });

  it("F-002-AC24 une relecture aboutie désarme l'échéance : la persistance reste active au-delà de 10 secondes", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const persistance = ouvrirPersistance(new Y.Doc(), ESPACE);
    await attendreEtat(persistance, "active");

    vi.advanceTimersByTime(JUSTE_AVANT_L_ECHEANCE_MS + 1);

    expect(persistance.lireEtat()).toBe("active");
    expect(vi.getTimerCount()).toBe(0);
  });
});
