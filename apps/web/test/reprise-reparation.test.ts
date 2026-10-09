// F-030 : réparation de la base de l'appareil (AC9, AC23, AC24) et d'une base de document sans son
// magasin (AC28), par le module de persistance, sans jamais effacer ni mêler de base de document.
import { describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

import {
  ouvrirEspaceLocal,
  ouvrirPersistance,
  type Persistance,
} from "../src/persistance/index.ts";
import { ouvrirFacade } from "./aides-facade.ts";
import {
  attendreEtat,
  enregistrements,
  ESPACE_A,
  ESPACE_B,
  laisserIndexedDbTravailler,
  nomsDesBases,
  retenirLesOuvertures,
} from "./aides-persistance.ts";
import {
  creerUneBase,
  decrireLaBase,
  ecouterLesErreursNonInterceptees,
  etatsSuccessifs,
  identifiantInscrit,
  inscrireALaPlaceDeLIdentifiant,
  instantsDesOuvertures,
  refuserLOuvertureDe,
  simulerLHorloge,
  tenirUneConnexion,
} from "./aides-reprise.ts";

const E1 = ESPACE_A;
const E2 = ESPACE_B;
const E3 = "3c2b1a09-8f7e-4d6c-a5b4-c3d2e1f0a9b8";
const APPAREIL = "notionlike:appareil";
const baseDe = (idEspace: string): string => `notionlike:espace:${idEspace}`;
const ECHEANCE_MS = 10_000;

function titres(doc: Y.Doc): string[] {
  return ouvrirFacade(doc)
    .lire()
    .racines.map((page) => page.titre)
    .sort();
}

/** Une page enregistrée dans la base d'un espace, par le module, sans la base de l'appareil. */
async function enregistrerUnePageDans(idEspace: string, titre: string): Promise<void> {
  const facade = ouvrirFacade(new Y.Doc());
  const persistance = ouvrirPersistance(facade.doc, { type: "espace", idEspace });
  await attendreEtat(persistance, "active");
  facade.creerPage(titre);
  await laisserIndexedDbTravailler();
  persistance.fermer();
}

async function ouvrirLEspaceLocal(
  candidat: string,
): Promise<{ doc: Y.Doc; persistance: Persistance }> {
  const doc = new Y.Doc();
  const persistance = ouvrirEspaceLocal(doc, candidat);
  await attendreEtat(persistance, "active");
  return { doc, persistance };
}

async function relu(nomDeLaBase: string): Promise<Y.Doc> {
  const doc = new Y.Doc();
  (await enregistrements(nomDeLaBase)).forEach((lu) => Y.applyUpdate(doc, Uint8Array.from(lu)));
  return doc;
}

describe("identifiant de l'espace local à la reprise", () => {
  it("F-030-AC9 base de l'appareil en échec à l'ouverture, candidat E2, sur un appareil dont l'espace E1 porte une page : après la reprise, la base de E1 porte les deux pages et aucune base n'existe au nom de E2", async () => {
    await inscrireALaPlaceDeLIdentifiant(E1);
    await enregistrerUnePageDans(E1, "Déjà dans E1");
    simulerLHorloge();
    refuserLOuvertureDe(APPAREIL);
    const facade = ouvrirFacade(new Y.Doc());
    const persistance = ouvrirEspaceLocal(facade.doc, E2);
    expect(persistance.lireEtat()).toBe("coupee");
    facade.creerPage("Créée pendant la coupure");
    vi.advanceTimersByTime(2_000);
    await laisserIndexedDbTravailler();
    expect(persistance.lireEtat()).toBe("coupee");
    expect(await nomsDesBases()).toEqual([APPAREIL, baseDe(E1)]);

    vi.restoreAllMocks();
    vi.advanceTimersToNextTimer();
    await attendreEtat(persistance, "active");
    await laisserIndexedDbTravailler();

    expect(titres(facade.doc)).toEqual(["Créée pendant la coupure", "Déjà dans E1"]);
    expect(titres(await relu(baseDe(E1)))).toEqual(["Créée pendant la coupure", "Déjà dans E1"]);
    expect(await nomsDesBases()).toEqual([APPAREIL, baseDe(E1)]);
    expect(await identifiantInscrit()).toBe(E1);
    persistance.fermer();
  });
});

describe("identifiant d'espace illisible", () => {
  it("F-030-AC23 valeur nulle et une seule base d'espace : son identifiant est inscrit, ses pages sont lues, le rechargement ne coupe pas, et deux ouvertures lancées ensemble retiennent le même identifiant", async () => {
    await inscrireALaPlaceDeLIdentifiant(null);
    await enregistrerUnePageDans(E1, "Page de E1");

    const [un, deux] = [new Y.Doc(), new Y.Doc()];
    const persistances = [ouvrirEspaceLocal(un, E2), ouvrirEspaceLocal(deux, E3)];
    const etats = persistances.map(etatsSuccessifs);
    await Promise.all(persistances.map((persistance) => attendreEtat(persistance, "active")));

    expect(await identifiantInscrit()).toBe(E1);
    expect(titres(un)).toEqual(["Page de E1"]);
    expect(titres(deux)).toEqual(["Page de E1"]);
    expect(etats).toEqual([["active"], ["active"]]);
    expect(await nomsDesBases()).toEqual([APPAREIL, baseDe(E1)]);
    persistances.forEach((persistance) => persistance.fermer());

    const recharge = await ouvrirLEspaceLocal(E3);
    expect(titres(recharge.doc)).toEqual(["Page de E1"]);
    expect(await nomsDesBases()).toEqual([APPAREIL, baseDe(E1)]);
  });

  it("F-030-AC23 chaîne mal formée et aucune base d'espace : le candidat de la session est inscrit, sans base tirée de la valeur illisible ; le rechargement relit cet espace", async () => {
    await inscrireALaPlaceDeLIdentifiant(`${E1}:page`);

    const ouvert = await ouvrirLEspaceLocal(E2);
    ouvrirFacade(ouvert.doc).creerPage("Première page");
    await laisserIndexedDbTravailler();
    ouvert.persistance.fermer();

    expect(await identifiantInscrit()).toBe(E2);
    expect(await nomsDesBases()).toEqual([APPAREIL, baseDe(E2)]);
    const recharge = await ouvrirLEspaceLocal(E3);
    expect(titres(recharge.doc)).toEqual(["Première page"]);
    expect(await identifiantInscrit()).toBe(E2);
  });

  it("F-030-AC23 valeur illisible, aucune base d'espace, deux ouvertures lancées ensemble avec deux candidats : l'inscription relit la valeur dans sa transaction, un seul identifiant est retenu et une seule base d'espace créée", async () => {
    await inscrireALaPlaceDeLIdentifiant("");

    const persistances = [ouvrirEspaceLocal(new Y.Doc(), E2), ouvrirEspaceLocal(new Y.Doc(), E3)];
    await Promise.all(persistances.map((persistance) => attendreEtat(persistance, "active")));

    const retenu = await identifiantInscrit();
    expect([E2, E3]).toContain(retenu);
    expect(await nomsDesBases()).toEqual([APPAREIL, baseDe(String(retenu))]);
    persistances.forEach((persistance) => persistance.fermer());
  });

  it("F-030-AC23 seules comptent les bases dont le nom a la forme d'une base d'espace : une base de page, et une base d'espace au suffixe qui n'est pas un UUID canonique, ne sont pas des espaces", async () => {
    await inscrireALaPlaceDeLIdentifiant(null);
    await enregistrerUnePageDans(E1, "Page de E1");
    await creerUneBase(`notionlike:espace:${E3.toUpperCase()}`, ["updates"]);
    await creerUneBase(`notionlike:page:${E3}:${E2}`, ["updates"]);
    await creerUneBase(`autre:espace:${E3}`, ["updates"]);

    const ouvert = await ouvrirLEspaceLocal(E2);

    expect(await identifiantInscrit()).toBe(E1);
    expect(titres(ouvert.doc)).toEqual(["Page de E1"]);
    ouvert.persistance.fermer();
  });

  it("F-030-AC23 nombre à la place de l'identifiant et deux bases d'espace : le candidat est inscrit, aucune des deux bases n'est lue ni modifiée, octet pour octet", async () => {
    await inscrireALaPlaceDeLIdentifiant(42);
    await enregistrerUnePageDans(E1, "Page de E1");
    await enregistrerUnePageDans(E3, "Page de E3");
    const avant = [await enregistrements(baseDe(E1)), await enregistrements(baseDe(E3))];

    const ouvert = await ouvrirLEspaceLocal(E2);
    await laisserIndexedDbTravailler();

    expect(await identifiantInscrit()).toBe(E2);
    expect(titres(ouvert.doc)).toEqual([]);
    expect([await enregistrements(baseDe(E1)), await enregistrements(baseDe(E3))]).toEqual(avant);
    expect(await nomsDesBases()).toEqual([APPAREIL, baseDe(E2), baseDe(E1), baseDe(E3)].sort());
    ouvert.persistance.fermer();
    const recharge = await ouvrirLEspaceLocal(E3);
    expect(await identifiantInscrit()).toBe(E2);
    expect(titres(recharge.doc)).toEqual([]);
  });

  it.each([
    [
      "absente du navigateur",
      (): void =>
        void Object.defineProperty(indexedDB, "databases", {
          value: undefined,
          configurable: true,
        }),
    ],
    [
      "qui lève",
      (): void =>
        void vi.spyOn(indexedDB, "databases").mockImplementation(() => {
          throw new DOMException("refus", "SecurityError");
        }),
    ],
    [
      "qui rejette",
      (): void =>
        void vi
          .spyOn(indexedDB, "databases")
          .mockRejectedValue(new DOMException("refus", "UnknownError")),
    ],
  ])(
    "F-030-AC23 énumération des bases %s : le candidat est inscrit, la base d'espace existante n'est ni lue ni modifiée, sans erreur non interceptée",
    async (_cas, rendreIndisponible) => {
      const relever = ecouterLesErreursNonInterceptees();
      await inscrireALaPlaceDeLIdentifiant({ pas: "un identifiant" });
      await enregistrerUnePageDans(E1, "Page de E1");
      const avant = await enregistrements(baseDe(E1));
      rendreIndisponible();

      const ouvert = await ouvrirLEspaceLocal(E2);
      await laisserIndexedDbTravailler();
      vi.restoreAllMocks();
      Reflect.deleteProperty(indexedDB, "databases");
      expect(typeof indexedDB.databases).toBe("function");

      expect(await identifiantInscrit()).toBe(E2);
      expect(titres(ouvert.doc)).toEqual([]);
      expect(await enregistrements(baseDe(E1))).toEqual(avant);
      expect(relever()).toEqual([]);
      ouvert.persistance.fermer();
    },
  );

  it("F-030-AC23 un identifiant canonique déjà inscrit n'est jamais remplacé, même si une autre base d'espace existe seule", async () => {
    await inscrireALaPlaceDeLIdentifiant(E1);
    await enregistrerUnePageDans(E3, "Page d'un autre espace");
    const enumerations = vi.spyOn(indexedDB, "databases");

    const ouvert = await ouvrirLEspaceLocal(E2);

    expect(enumerations).not.toHaveBeenCalled();
    expect(await identifiantInscrit()).toBe(E1);
    expect(titres(ouvert.doc)).toEqual([]);
    ouvert.persistance.fermer();
  });
});

describe("base de l'appareil sans son magasin", () => {
  it("F-030-AC24 le magasin est recréé par une montée de version sans toucher au reste, l'identifiant de la seule base d'espace est inscrit, sa page est lue ; l'ouverture suivante ne répare plus rien", async () => {
    await creerUneBase(APPAREIL, ["autre"]);
    await enregistrerUnePageDans(E1, "Page de E1");

    const ouvert = await ouvrirLEspaceLocal(E2);

    expect(titres(ouvert.doc)).toEqual(["Page de E1"]);
    expect(await identifiantInscrit()).toBe(E1);
    const reparee = await decrireLaBase(APPAREIL);
    expect(reparee.version).toBe(2);
    expect(Object.keys(reparee.magasins).sort()).toEqual(["autre", "reglages"]);
    expect(reparee.magasins.autre?.valeurs).toEqual(["gardée"]);
    expect(reparee.magasins.reglages).toMatchObject({ cleAutomatique: false, chemin: null });
    ouvert.persistance.fermer();

    const montees = vi.fn();
    const ouvrir = indexedDB.open.bind(indexedDB);
    vi.spyOn(indexedDB, "open").mockImplementation((nom, version) => {
      const demande = ouvrir(nom, version);
      demande.addEventListener("upgradeneeded", () => montees(nom));
      return demande;
    });
    const recharge = await ouvrirLEspaceLocal(E3);
    expect(titres(recharge.doc)).toEqual(["Page de E1"]);
    expect(montees).not.toHaveBeenCalledWith(APPAREIL);
    expect((await decrireLaBase(APPAREIL)).version).toBe(2);
  });

  it("F-030-AC24 la montée de version échoue : coupure, puis réparation à la tentative suivante", async () => {
    await creerUneBase(APPAREIL, []);
    simulerLHorloge();
    const ouvrir = indexedDB.open.bind(indexedDB);
    vi.spyOn(indexedDB, "open").mockImplementation((nom, version) => {
      if (version !== undefined) {
        throw new DOMException("refus", "UnknownError");
      }
      return ouvrir(nom, version);
    });
    const doc = new Y.Doc();
    const persistance = ouvrirEspaceLocal(doc, E2);
    await attendreEtat(persistance, "coupee");
    expect((await decrireLaBase(APPAREIL)).magasins).toEqual({});

    vi.restoreAllMocks();
    vi.advanceTimersToNextTimer();
    await attendreEtat(persistance, "active");

    expect(await identifiantInscrit()).toBe(E2);
    expect((await decrireLaBase(APPAREIL)).version).toBe(2);
    persistance.fermer();
  });

  it("F-030-AC24 F-030-AC18 une connexion tenue ouverte sur la base laisse la montée en attente : coupure à l'échéance, aucun magasin créé, même quand la montée aboutit après l'abandon ; connexion fermée, la tentative suivante répare", async () => {
    await creerUneBase(APPAREIL, []);
    simulerLHorloge();
    const relever = ecouterLesErreursNonInterceptees();
    const tenue = await tenirUneConnexion(APPAREIL);
    const doc = new Y.Doc();
    const persistance = ouvrirEspaceLocal(doc, E2);
    await laisserIndexedDbTravailler();
    vi.advanceTimersByTime(ECHEANCE_MS - 1);
    await laisserIndexedDbTravailler();
    expect(persistance.lireEtat()).toBe("relecture");
    vi.advanceTimersByTime(1);
    expect(persistance.lireEtat()).toBe("coupee");

    // La connexion est rendue hors de toute tentative : la montée abandonnée aboutit alors.
    tenue.close();
    await laisserIndexedDbTravailler();
    expect(await decrireLaBase(APPAREIL)).toEqual({ version: 1, magasins: {} });
    expect(await nomsDesBases()).toEqual([APPAREIL]);

    vi.advanceTimersToNextTimer();
    await attendreEtat(persistance, "active");
    expect(Object.keys((await decrireLaBase(APPAREIL)).magasins)).toEqual(["reglages"]);
    expect(await identifiantInscrit()).toBe(E2);
    persistance.fermer();
    await laisserIndexedDbTravailler();
    expect(relever()).toEqual([]);
  });

  it("F-030-AC24 une base de l'appareil d'une version supérieure à celle que l'application connaît n'est ni abaissée ni supprimée : coupure retentée", async () => {
    await new Promise<void>((resoudre) => {
      const demande = indexedDB.open(APPAREIL, 3);
      demande.onupgradeneeded = () => demande.result.createObjectStore("reglages");
      demande.onsuccess = () => {
        demande.result.close();
        resoudre();
      };
    });
    simulerLHorloge();
    const persistance = ouvrirEspaceLocal(new Y.Doc(), E2);
    await attendreEtat(persistance, "coupee");
    const instants = instantsDesOuvertures();
    vi.advanceTimersToNextTimer();
    await laisserIndexedDbTravailler();

    expect(instants.length).toBeGreaterThan(0);
    expect(persistance.lireEtat()).toBe("coupee");
    expect(await decrireLaBase(APPAREIL)).toEqual({
      version: 3,
      magasins: { reglages: { cleAutomatique: false, chemin: null, valeurs: [] } },
    });
    expect(await nomsDesBases()).toEqual([APPAREIL]);
    persistance.fermer();
  });

  it("F-030-AC24 pendant sa transaction, la connexion du module à la base de l'appareil se ferme à la réception de `versionchange` : la montée de version demandée par un autre onglet n'est jamais bloquée", async () => {
    const bloquee = vi.fn();
    const montee = new Promise<void>((resoudre) => {
      const lire = IDBObjectStore.prototype.get;
      vi.spyOn(IDBObjectStore.prototype, "get").mockImplementationOnce(function (
        this: IDBObjectStore,
        cle: IDBValidKey | IDBKeyRange,
      ) {
        const demande = indexedDB.open(APPAREIL, 2);
        demande.onblocked = bloquee;
        demande.onsuccess = () => {
          demande.result.close();
          resoudre();
        };
        return lire.call(this, cle);
      });
    });

    const persistance = ouvrirEspaceLocal(new Y.Doc(), E2);
    await montee;
    await attendreEtat(persistance, "active");

    expect(bloquee).not.toHaveBeenCalled();
    persistance.fermer();
  });

  it("F-030-AC24 le module ne tient la base de l'appareil que le temps de ses transactions : une fois la persistance active, une montée de version de cette base n'est pas bloquée", async () => {
    const ouvert = await ouvrirLEspaceLocal(E2);
    const bloquee = vi.fn();

    await new Promise<void>((resoudre) => {
      const demande = indexedDB.open(APPAREIL, 5);
      demande.onblocked = bloquee;
      demande.onsuccess = () => {
        demande.result.close();
        resoudre();
      };
    });

    expect(bloquee).not.toHaveBeenCalled();
    ouvert.persistance.fermer();
  });
});

describe("base de document sans son magasin", () => {
  const DOCUMENT = { type: "espace", idEspace: E1 } as const;

  it("F-030-AC28 F-030-AC18 la persistance est tenue pour coupée sans instance de la bibliothèque, une modification faite avant la réparation ne lève pas, les deux magasins sont recréés tels que la bibliothèque les crée, la modification est relue de la base ; l'ouverture suivante ne répare plus rien", async () => {
    await creerUneBase(baseDe(E1), ["autre"]);
    await creerReference();
    const relever = ecouterLesErreursNonInterceptees();
    const facade = ouvrirFacade(new Y.Doc());
    const persistance = ouvrirPersistance(facade.doc, DOCUMENT);
    const etats = etatsSuccessifs(persistance);
    expect(persistance.lireEtat()).toBe("relecture");
    await attendreEtat(persistance, "coupee");

    expect(() => facade.creerPage("Avant la réparation")).not.toThrow();
    expect(titres(facade.doc)).toEqual(["Avant la réparation"]);
    expect(persistance.lireEtat()).toBe("coupee");
    await attendreEtat(persistance, "active");
    await laisserIndexedDbTravailler();

    expect(etats).toEqual(["coupee", "active"]);
    const [reparee, reference] = [await decrireLaBase(baseDe(E1)), await decrireLaBase(baseDe(E3))];
    expect(reparee.version).toBe(2);
    expect(Object.keys(reparee.magasins).sort()).toEqual(["autre", "custom", "updates"]);
    expect(reparee.magasins.autre?.valeurs).toEqual(["gardée"]);
    for (const magasin of ["custom", "updates"]) {
      expect(reparee.magasins[magasin]).toMatchObject({
        cleAutomatique: reference.magasins[magasin]?.cleAutomatique,
        chemin: reference.magasins[magasin]?.chemin,
      });
    }
    expect(reparee.magasins.updates?.cleAutomatique).toBe(true);
    expect(titres(await relu(baseDe(E1)))).toEqual(["Avant la réparation"]);
    persistance.fermer();

    const suivante = ouvrirPersistance(new Y.Doc(), DOCUMENT);
    const etatsDeLaSuivante = etatsSuccessifs(suivante);
    await attendreEtat(suivante, "active");
    expect(etatsDeLaSuivante).toEqual(["active"]);
    expect((await decrireLaBase(baseDe(E1))).version).toBe(2);
    await laisserIndexedDbTravailler();
    expect(relever()).toEqual([]);
  });

  // Une base créée par la bibliothèque seule : ses magasins font foi (F-030-AC20).
  async function creerReference(): Promise<void> {
    const persistance = ouvrirPersistance(new Y.Doc(), { type: "espace", idEspace: E3 });
    await attendreEtat(persistance, "active");
    persistance.fermer();
  }

  it("F-030-AC28 F-030-AC18 montée de version en attente derrière la connexion d'un autre onglet : coupure maintenue jusqu'à l'échéance et au-delà, aucun magasin créé hors d'une tentative, puis réparation à la tentative qui suit la fermeture de cette connexion", async () => {
    await creerUneBase(baseDe(E1), []);
    simulerLHorloge();
    const relever = ecouterLesErreursNonInterceptees();
    const tenue = await tenirUneConnexion(baseDe(E1));
    const facade = ouvrirFacade(new Y.Doc());
    const persistance = ouvrirPersistance(facade.doc, DOCUMENT);
    const etats = etatsSuccessifs(persistance);
    await laisserIndexedDbTravailler();
    expect(() => facade.creerPage("Pendant l'attente")).not.toThrow();
    vi.advanceTimersByTime(ECHEANCE_MS);
    expect(etats).toEqual(["coupee"]);

    tenue.close();
    await laisserIndexedDbTravailler();
    expect(await decrireLaBase(baseDe(E1))).toEqual({ version: 1, magasins: {} });

    vi.advanceTimersToNextTimer();
    await attendreEtat(persistance, "active");
    await laisserIndexedDbTravailler();
    expect(titres(await relu(baseDe(E1)))).toEqual(["Pendant l'attente"]);
    persistance.fermer();
    await laisserIndexedDbTravailler();
    expect(relever()).toEqual([]);
  });

  it("F-030-AC18 F-030-AC28 une base dont un enregistrement n'est pas une mise à jour applicable n'est pas réparée : aucune instance n'y est construite, rien n'y est écrit, c'est une coupure retentée sans erreur non interceptée", async () => {
    simulerLHorloge();
    const relever = ecouterLesErreursNonInterceptees();
    const illisible = Uint8Array.from([1, 255, 255, 255]);
    await new Promise<void>((resoudre) => {
      const demande = indexedDB.open(baseDe(E1));
      demande.onupgradeneeded = () => {
        demande.result.createObjectStore("updates", { autoIncrement: true }).add(illisible);
        demande.result.createObjectStore("custom");
      };
      demande.onsuccess = () => {
        demande.result.close();
        resoudre();
      };
    });
    expect(() => Y.applyUpdate(new Y.Doc(), illisible)).toThrow();
    const ecritures = vi.spyOn(IDBObjectStore.prototype, "add");
    const facade = ouvrirFacade(new Y.Doc());

    const persistance = ouvrirPersistance(facade.doc, DOCUMENT);
    await attendreEtat(persistance, "coupee");
    facade.creerPage("En mémoire");
    vi.advanceTimersToNextTimer();
    await laisserIndexedDbTravailler();

    expect(persistance.lireEtat()).toBe("coupee");
    expect(ecritures).not.toHaveBeenCalled();
    expect(await enregistrements(baseDe(E1))).toEqual([[...illisible]]);
    persistance.fermer();
    await laisserIndexedDbTravailler();
    expect(relever()).toEqual([]);
  });

  it("F-030-AC28 F-030-AC10 une base absente n'est pas ce cas : la lecture brute ne la crée pas, c'est la bibliothèque qui la crée à sa construction", async () => {
    const retenues = retenirLesOuvertures(2);
    const persistance = ouvrirPersistance(new Y.Doc(), DOCUMENT);
    await laisserIndexedDbTravailler();

    expect(persistance.lireEtat()).toBe("relecture");
    expect(await nomsDesBases()).toEqual([]);

    retenues.cesser();
    retenues.repondre();
    await attendreEtat(persistance, "active");
    expect((await decrireLaBase(baseDe(E1))).version).toBe(1);
    persistance.fermer();
  });
});
