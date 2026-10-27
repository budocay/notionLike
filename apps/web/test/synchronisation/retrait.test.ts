// F-032 : retrait d'un espace de l'appareil (AC20, AC22, H8) et effacement de la copie locale par
// l'énumération des bases (AC21, retouche R4), sur des appareils simulés : toutes les bases de cet
// espace et aucune autre, un nom que la fonction de nommage ne reconnaît pas jamais effacé, une
// demande bloquée par une connexion tierce attendue jusqu'à 10 secondes, le repli sur la lecture de
// l'arborescence sans énumération (H7), et le protocole du canal du registre de F-013-AC24.
import { demarrerServeurDEssai, type ServeurDEssai } from "@notionlike/server/essai";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

import { lireLesPagesDeLaBase } from "../../src/espace/appareil.ts";
import {
  type DesignationDocument,
  nomDeBase,
  ouvrirPersistance,
} from "../../src/persistance/index.ts";
import { type OptionsDuRetrait, retirerDeLAppareil } from "../../src/synchronisation/index.ts";
import type { CanalEntreOnglets } from "../../src/synchronisation/environnement.ts";
import {
  contenuDeLAppareil as clesDeLAppareil,
  E_ALPHA,
  E_APPAREIL,
  E_BETA,
  ECRITURE,
  P_DEUX,
  P_UN,
  poserDansLAppareil,
  poserUneBase,
} from "../aides-appareil.ts";
import { creerFacade } from "../aides-facade.ts";
import { ecrireLaVersion, VERSION_NON_PRISE_EN_CHARGE } from "../aides-format.ts";
import {
  type Appareil,
  attendreQue,
  fermerLesOnglets,
  nouvelAppareil,
  ouvrirUnOnglet,
  pause,
} from "./aides-synchro.ts";

vi.setConfig({ testTimeout: 60_000 });

const T_UN = "708192a3-b4c5-4d01-8253-6e7f8091a2b3";
const P_TROIS = "8192a3b4-c5d6-4e12-9364-7f8091a2b3c4";

let serveur: ServeurDEssai;
beforeAll(async () => {
  serveur = await demarrerServeurDEssai();
}, 30_000);
afterAll(async () => {
  await serveur.fermer();
});
afterEach(() => {
  fermerLesOnglets();
});

function canalDe(appareil: Appareil): OptionsDuRetrait["environnement"] {
  return {
    ouvrirUnCanal: (nom) =>
      new BroadcastChannel(`${appareil.navigateur}|${nom}`) as unknown as CanalEntreOnglets,
  };
}

async function nomsDesBases(appareil: Appareil): Promise<string[]> {
  return (await appareil.idb.databases()).map(({ name = "" }) => name).sort();
}

/** La base du document désigné, avec ce document, écrite par le module de persistance. */
async function poserLeDocument(
  appareil: Appareil,
  designation: DesignationDocument,
  doc: Y.Doc = new Y.Doc(),
): Promise<void> {
  if (doc.share.size === 0) {
    doc.getMap("temoin").set("ecrit", true);
  }
  const persistance = appareil.sur(() => ouvrirPersistance(doc, designation));
  await attendreQue(() => persistance.lireEtat() === "active", 12_000, "base posée");
  await attendreQue(() => !persistance.aDesModificationsNonEnregistrees(), 12_000);
  await pause(30);
  persistance.fermer();
}

/** Alpha : base d'espace, deux pages (dont une orpheline), une table ; Beta : une page. */
async function deuxEspaces(appareil: Appareil): Promise<void> {
  await poserLeDocument(appareil, { type: "espace", idEspace: E_ALPHA });
  await poserLeDocument(appareil, { type: "page", idEspace: E_ALPHA, idPage: P_UN });
  await poserLeDocument(appareil, { type: "page", idEspace: E_ALPHA, idPage: P_DEUX });
  await poserLeDocument(appareil, { type: "table", idEspace: E_ALPHA, idTable: T_UN });
  await poserLeDocument(appareil, { type: "page", idEspace: E_BETA, idPage: P_UN });
  await appareil.sur(() => poserUneBase(`notionlike:espace:${E_ALPHA}:inconnue`));
  await appareil.sur(() =>
    poserDansLAppareil({
      "espace-local": E_APPAREIL,
      [`registre:${E_ALPHA}`]: ECRITURE,
      [`nom:${E_ALPHA}`]: "Alpha",
      [`premiere-synchronisation:${E_ALPHA}`]: true,
      "espace-retenu": E_ALPHA,
      [`registre:${E_BETA}`]: ECRITURE,
      [`nom:${E_BETA}`]: "Beta",
    }),
  );
}

const BASES_DE_BETA_ET_AUTRES = [
  "notionlike:appareil",
  `notionlike:espace:${E_ALPHA}:inconnue`,
  nomDeBase({ type: "page", idEspace: E_BETA, idPage: P_UN }),
].sort();

describe("retrait d'un espace de l'appareil (F-032-AC20, H8)", () => {
  it("F-032-AC20 F-032-AC14 toutes les bases de l'espace, orphelines comprises, et aucune autre ; son entrée, son nom, sa marque et l'espace retenu qui le désigne sont oubliés, rien d'un autre espace", async () => {
    const appareil = nouvelAppareil();
    await deuxEspaces(appareil);
    const lireLesPages = vi.fn(async () => []);

    const issue = await appareil.sur(() =>
      retirerDeLAppareil(E_ALPHA, { environnement: canalDe(appareil), lireLesPages }),
    );

    expect(issue).toBe("retire");
    expect(lireLesPages).not.toHaveBeenCalled();
    expect(await nomsDesBases(appareil)).toEqual(BASES_DE_BETA_ET_AUTRES);
    expect(await appareil.sur(() => clesDeLAppareil())).toEqual({
      "espace-local": E_APPAREIL,
      [`registre:${E_BETA}`]: ECRITURE,
      [`nom:${E_BETA}`]: "Beta",
    });
  });

  it("F-032-AC20 un identifiant mal formé ne désigne rien : échec, aucune base touchée", async () => {
    const appareil = nouvelAppareil();
    await deuxEspaces(appareil);
    const avant = await nomsDesBases(appareil);

    expect(
      await appareil.sur(() =>
        retirerDeLAppareil("pas-un-uuid", {
          environnement: canalDe(appareil),
          lireLesPages: async () => [],
        }),
      ),
    ).toBe("echec");
    expect(await nomsDesBases(appareil)).toEqual(avant);
  });

  it("F-032-AC22 F-013-AC24 l'onglet ouvert sur l'espace retiré est prévenu par le canal du registre : il ferme tout, puis apprend que c'est fait", async () => {
    const appareil = nouvelAppareil();
    await deuxEspaces(appareil);
    const etapes: string[] = [];
    const ouvert: { fermer?: () => void } = {};
    const onglet = await ouvrirUnOnglet({
      serveur,
      cookie: "",
      idEspace: E_ALPHA,
      appareil,
      autreEspace: true,
      surEffacement: (etape) => {
        etapes.push(etape);
        if (etape === "demande") {
          ouvert.fermer?.();
        }
      },
    });
    ouvert.fermer = () => onglet.persistance.fermer();
    await attendreQue(() => onglet.synchro.lireEtat().registreLu);

    const issue = await appareil.sur(() =>
      retirerDeLAppareil(E_ALPHA, {
        environnement: canalDe(appareil),
        lireLesPages: async () => [],
      }),
    );

    await attendreQue(() => etapes.length === 2);
    expect(etapes).toEqual(["demande", "faite"]);
    expect(issue).toBe("retire");
    expect(await nomsDesBases(appareil)).toEqual(BASES_DE_BETA_ET_AUTRES);
  });

  it("F-032-AC20 une connexion tierce, sans gestionnaire de changement de version, bloque l'effacement : il est attendu, et fait dès qu'elle se ferme", async () => {
    const appareil = nouvelAppareil();
    await deuxEspaces(appareil);
    const nom = nomDeBase({ type: "page", idEspace: E_ALPHA, idPage: P_UN });
    const tierce = await new Promise<IDBDatabase>((resoudre) => {
      const demande = appareil.idb.open(nom);
      demande.onsuccess = () => resoudre(demande.result);
    });

    const retrait = appareil.sur(() =>
      retirerDeLAppareil(E_ALPHA, {
        environnement: canalDe(appareil),
        lireLesPages: async () => [],
      }),
    );
    await pause(300);
    tierce.close();

    expect(await retrait).toBe("retire");
    expect(await nomsDesBases(appareil)).toEqual(BASES_DE_BETA_ET_AUTRES);
  });

  it("F-032-AC20 F-007-AC21 une connexion tierce qui ne se ferme pas : échec après 10 secondes, et l'entrée du registre est retirée quand même", async () => {
    const appareil = nouvelAppareil();
    await deuxEspaces(appareil);
    const nom = nomDeBase({ type: "page", idEspace: E_ALPHA, idPage: P_UN });
    const tierce = await new Promise<IDBDatabase>((resoudre) => {
      const demande = appareil.idb.open(nom);
      demande.onsuccess = () => resoudre(demande.result);
    });
    const debut = Date.now();

    const issue = await appareil.sur(() =>
      retirerDeLAppareil(E_ALPHA, {
        environnement: canalDe(appareil),
        lireLesPages: async () => [],
      }),
    );

    expect(issue).toBe("echec");
    expect(Date.now() - debut).toBeGreaterThanOrEqual(9900);
    const cles = await appareil.sur(() => clesDeLAppareil());
    expect(Object.keys(cles).filter((cle) => cle.includes(E_ALPHA))).toEqual([]);
    tierce.close();
  });
});

describe("repli sans énumération (F-032-AC20, H7)", () => {
  function sansEnumeration(appareil: Appareil): void {
    Object.defineProperty(appareil.idb, "databases", { value: undefined, configurable: true });
  }

  it("F-032-AC20 H7 la base du document d'espace et celle de chaque page et table de son arborescence et de sa corbeille, lues dans sa base ; une base orpheline reste", async () => {
    const appareil = nouvelAppareil();
    const facade = creerFacade();
    const page = facade.creerPage("Page");
    const table = facade.creerTable("Table");
    const jetee = facade.creerPage("Jetée");
    facade.mettreALaCorbeille(jetee);
    await poserLeDocument(appareil, { type: "espace", idEspace: E_ALPHA }, facade.doc);
    for (const idPage of [page, jetee, P_TROIS]) {
      await poserLeDocument(appareil, { type: "page", idEspace: E_ALPHA, idPage });
    }
    await poserLeDocument(appareil, { type: "table", idEspace: E_ALPHA, idTable: table });
    await appareil.sur(() => poserDansLAppareil({ [`registre:${E_ALPHA}`]: ECRITURE }));
    const avant = await nomsDesBases(appareil);
    sansEnumeration(appareil);

    const issue = await appareil.sur(() =>
      retirerDeLAppareil(E_ALPHA, {
        environnement: canalDe(appareil),
        lireLesPages: lireLesPagesDeLaBase,
      }),
    );

    expect(issue).toBe("retire");
    Reflect.deleteProperty(appareil.idb, "databases");
    expect(await nomsDesBases(appareil)).toEqual(
      avant.filter(
        (nom) =>
          nom === "notionlike:appareil" ||
          nom === nomDeBase({ type: "page", idEspace: E_ALPHA, idPage: P_TROIS }),
      ),
    );
  });

  it("F-032-AC20 H7 document d'espace d'une version refusée : seule sa base est effacée, ses pages restent", async () => {
    const appareil = nouvelAppareil();
    const doc = new Y.Doc();
    ecrireLaVersion(doc, VERSION_NON_PRISE_EN_CHARGE);
    await poserLeDocument(appareil, { type: "espace", idEspace: E_ALPHA }, doc);
    await poserLeDocument(appareil, { type: "page", idEspace: E_ALPHA, idPage: P_UN });
    await appareil.sur(() => poserDansLAppareil({ [`registre:${E_ALPHA}`]: ECRITURE }));
    sansEnumeration(appareil);

    expect(await appareil.sur(() => lireLesPagesDeLaBase(E_ALPHA))).toEqual([]);
    expect(
      await appareil.sur(() =>
        retirerDeLAppareil(E_ALPHA, {
          environnement: canalDe(appareil),
          lireLesPages: lireLesPagesDeLaBase,
        }),
      ),
    ).toBe("retire");
    Reflect.deleteProperty(appareil.idb, "databases");
    expect(await nomsDesBases(appareil)).toEqual([
      "notionlike:appareil",
      nomDeBase({ type: "page", idEspace: E_ALPHA, idPage: P_UN }),
    ]);
  });

  it("F-032-AC20 H7 base d'espace absente : aucune page lue, et elle n'est pas créée", async () => {
    const appareil = nouvelAppareil();

    expect(await appareil.sur(() => lireLesPagesDeLaBase(E_ALPHA))).toEqual([]);
    expect(await nomsDesBases(appareil)).toEqual([]);
  });
});

describe("effacer la copie locale par l'énumération (F-032-AC21, retouche R4)", () => {
  it("F-032-AC21 F-013-AC24 l'effacement de la copie locale emporte aussi les bases orphelines de cet espace, et aucune base d'un autre espace de l'appareil", async () => {
    const appareil = nouvelAppareil();
    const onglet = await ouvrirUnOnglet({ serveur, cookie: "", idEspace: E_ALPHA, appareil });
    const page = onglet.facade.creerPage("Gardée dans l'arborescence");
    await attendreQue(() => onglet.synchro.lireEtat().registreLu);
    await poserLeDocument(appareil, { type: "page", idEspace: E_ALPHA, idPage: page });
    await poserLeDocument(appareil, { type: "page", idEspace: E_ALPHA, idPage: P_TROIS });
    await poserLeDocument(appareil, { type: "page", idEspace: E_BETA, idPage: P_UN });
    await appareil.sur(() =>
      poserDansLAppareil({ [`registre:${E_BETA}`]: ECRITURE, [`nom:${E_BETA}`]: "Beta" }),
    );
    onglet.persistance.fermer();

    expect(await onglet.synchro.effacerLaCopieLocale()).toBe("effacee");

    expect(await nomsDesBases(appareil)).toEqual([
      "notionlike:appareil",
      nomDeBase({ type: "page", idEspace: E_BETA, idPage: P_UN }),
    ]);
    expect(await appareil.sur(() => clesDeLAppareil())).toEqual({
      [`registre:${E_BETA}`]: ECRITURE,
      [`nom:${E_BETA}`]: "Beta",
    });
  });
});
