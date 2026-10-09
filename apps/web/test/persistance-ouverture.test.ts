import { describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

import {
  type DesignationDocument,
  ErreurPersistance,
  ouvrirEspaceLocal,
  ouvrirPersistance,
} from "../src/persistance/index.ts";
import { creerFacade, ouvrirFacade } from "./aides-facade.ts";
import { FORMES_REFUSEES, PAGE_P, TABLE_T } from "./aides-identifiants.ts";
import {
  attendreEtat,
  enregistrements,
  ESPACE_A,
  ESPACE_B,
  nomsDesBases,
} from "./aides-persistance.ts";

const PAGE_AVEC_DEUX_POINTS = "page:avec:deux-points";
const DOCUMENT_VIDE = [0, 0];
const PREFIXE_DES_BASES_D_ESPACE = "notionlike:espace:";

async function ouvrirEtAttendre(doc: Y.Doc, designation: DesignationDocument) {
  const persistance = ouvrirPersistance(doc, designation);
  await attendreEtat(persistance, "active");
  return persistance;
}

async function ouvrirEspaceLocalEtAttendre(doc: Y.Doc, idCandidat: string) {
  const persistance = ouvrirEspaceLocal(doc, idCandidat);
  await attendreEtat(persistance, "active");
  return persistance;
}

// L'identifiant retenu pour l'espace local n'est pas exposé : il se lit dans le nom des bases.
async function espacesEnregistres(): Promise<string[]> {
  return (await nomsDesBases())
    .filter((nom) => nom.startsWith(PREFIXE_DES_BASES_D_ESPACE))
    .map((nom) => nom.slice(PREFIXE_DES_BASES_D_ESPACE.length));
}

type Ouverture = (identifiant: string) => unknown;

// Chaque endroit où un identifiant d'espace, de page ou de table entre dans un nom de base.
const ENTREES_D_UN_IDENTIFIANT: readonly (readonly [string, string, Ouverture])[] = [
  [
    "d'espace",
    "pour la base d'un espace",
    (idEspace) => ouvrirPersistance(new Y.Doc(), { type: "espace", idEspace }),
  ],
  [
    "d'espace",
    "pour la base d'une page",
    (idEspace) => ouvrirPersistance(new Y.Doc(), { type: "page", idEspace, idPage: PAGE_P }),
  ],
  [
    "d'espace",
    "pour la base d'une table",
    (idEspace) => ouvrirPersistance(new Y.Doc(), { type: "table", idEspace, idTable: TABLE_T }),
  ],
  [
    "d'espace",
    "candidat de l'espace local",
    (idEspace) => ouvrirEspaceLocal(new Y.Doc(), idEspace),
  ],
  [
    "de page",
    "pour la base d'une page",
    (idPage) => ouvrirPersistance(new Y.Doc(), { type: "page", idEspace: ESPACE_A, idPage }),
  ],
  [
    "de table",
    "pour la base d'une table",
    (idTable) => ouvrirPersistance(new Y.Doc(), { type: "table", idEspace: ESPACE_A, idTable }),
  ],
];

function refusDe(ouvrir: () => unknown): unknown {
  try {
    ouvrir();
    return undefined;
  } catch (erreur) {
    return erreur;
  }
}

describe("nom des bases", () => {
  it("F-002-AC25 nomme la base d'un espace, d'une page et d'une table par le type et les identifiants", async () => {
    await ouvrirEtAttendre(new Y.Doc(), { type: "espace", idEspace: ESPACE_A });
    await ouvrirEtAttendre(new Y.Doc(), { type: "page", idEspace: ESPACE_A, idPage: PAGE_P });
    await ouvrirEtAttendre(new Y.Doc(), { type: "table", idEspace: ESPACE_A, idTable: TABLE_T });

    expect(await nomsDesBases()).toEqual([
      `notionlike:espace:${ESPACE_A}`,
      `notionlike:page:${ESPACE_A}:${PAGE_P}`,
      `notionlike:table:${ESPACE_A}:${TABLE_T}`,
    ]);
  });

  it("F-002-AC25 la page d'un espace A reste invisible et inchangée quand un espace B ouvre le même identifiant de page ; un identifiant de page qui contient « : » est refusé sans base", async () => {
    const docDeA = new Y.Doc();
    const persistanceDeA = await ouvrirEtAttendre(docDeA, {
      type: "page",
      idEspace: ESPACE_A,
      idPage: PAGE_P,
    });
    docDeA.getMap("temoin").set("contenu", "secret de A");
    persistanceDeA.fermer();
    const baseDeA = `notionlike:page:${ESPACE_A}:${PAGE_P}`;
    const baseDeB = `notionlike:page:${ESPACE_B}:${PAGE_P}`;
    const avant = await enregistrements(baseDeA);

    const docDeB = new Y.Doc();
    await ouvrirEtAttendre(docDeB, { type: "page", idEspace: ESPACE_B, idPage: PAGE_P });

    expect([...Y.encodeStateAsUpdate(docDeB)]).toEqual(DOCUMENT_VIDE);
    expect(docDeB.getMap("temoin").size).toBe(0);
    expect(await nomsDesBases()).toEqual([baseDeA, baseDeB].sort());
    expect(avant.some((enregistrement) => enregistrement.length > DOCUMENT_VIDE.length)).toBe(true);
    expect(await enregistrements(baseDeA)).toEqual(avant);

    const ouvertures = vi.spyOn(indexedDB, "open");
    const refus = refusDe(() =>
      ouvrirPersistance(new Y.Doc(), {
        type: "page",
        idEspace: ESPACE_B,
        idPage: PAGE_AVEC_DEUX_POINTS,
      }),
    );

    expect(ouvertures).not.toHaveBeenCalled();
    expect(refus).toBeInstanceOf(ErreurPersistance);
    expect(refus).toMatchObject({ code: "identifiant-invalide" });
    expect(await nomsDesBases()).toEqual([baseDeA, baseDeB].sort());
    expect(await enregistrements(baseDeA)).toEqual(avant);
  });

  it("F-002-AC25 F-002-AC28 un identifiant de page qui imite la base d'un autre espace est refusé sans base", async () => {
    const refus = refusDe(() =>
      ouvrirPersistance(new Y.Doc(), {
        type: "page",
        idEspace: ESPACE_A,
        idPage: `x:${ESPACE_B}:${PAGE_P}`,
      }),
    );

    expect(refus).toBeInstanceOf(ErreurPersistance);
    expect(await nomsDesBases()).toEqual([]);
  });

  describe.each(ENTREES_D_UN_IDENTIFIANT)("identifiant %s, %s", (sorte, _usage, ouvrir) => {
    it.each(FORMES_REFUSEES)(
      `F-002-AC28 refuse un identifiant ${sorte} %s sans ouvrir ni créer aucune base`,
      async (_cas, identifiant) => {
        const ouvertures = vi.spyOn(indexedDB, "open");

        const refus = refusDe(() => ouvrir(identifiant));

        expect(refus).toBeInstanceOf(ErreurPersistance);
        expect(refus).toMatchObject({ code: "identifiant-invalide" });
        expect(ouvertures).not.toHaveBeenCalled();
        expect(await nomsDesBases()).toEqual([]);
      },
    );
  });

  it("F-002-AC28 le message du refus ne cite pas l'identifiant refusé", () => {
    const refus = refusDe(() =>
      ouvrirPersistance(new Y.Doc(), {
        type: "page",
        idEspace: ESPACE_A,
        idPage: PAGE_AVEC_DEUX_POINTS,
      }),
    );

    expect(refus).toBeInstanceOf(ErreurPersistance);
    expect((refus as ErreurPersistance).message).not.toContain(PAGE_AVEC_DEUX_POINTS);
    expect((refus as ErreurPersistance).message).not.toContain(ESPACE_A);
  });
});

describe("états d'une persistance", () => {
  it("F-002-AC22 passe de « relecture » à « active » en prévenant ses abonnés, et plus ceux qui se sont désabonnés", async () => {
    const abonne = vi.fn();
    const desabonne = vi.fn();
    const persistance = ouvrirPersistance(new Y.Doc(), { type: "espace", idEspace: ESPACE_A });
    persistance.abonner(abonne);
    persistance.abonner(desabonne)();

    expect(persistance.lireEtat()).toBe("relecture");
    await attendreEtat(persistance, "active");

    expect(abonne).toHaveBeenCalledTimes(1);
    expect(desabonne).not.toHaveBeenCalled();
  });

  it("F-002-AC22 « fermee » est définitif : plus rien n'est enregistré après fermer()", async () => {
    const doc = new Y.Doc();
    const abonne = vi.fn();
    const persistance = await ouvrirEtAttendre(doc, { type: "espace", idEspace: ESPACE_A });
    persistance.abonner(abonne);
    const avant = await enregistrements(`notionlike:espace:${ESPACE_A}`);

    persistance.fermer();
    persistance.fermer();
    doc.getMap("temoin").set("contenu", "après fermeture");

    expect(persistance.lireEtat()).toBe("fermee");
    expect(abonne).toHaveBeenCalledTimes(1);
    expect(await enregistrements(`notionlike:espace:${ESPACE_A}`)).toEqual(avant);
  });

  it("F-002-AC22 fermée pendant la relecture, une persistance ne devient jamais active", async () => {
    const doc = new Y.Doc();
    const persistance = ouvrirPersistance(doc, { type: "espace", idEspace: ESPACE_A });

    persistance.fermer();
    const suivante = await ouvrirEtAttendre(new Y.Doc(), { type: "espace", idEspace: ESPACE_A });

    expect(suivante.lireEtat()).toBe("active");
    expect(persistance.lireEtat()).toBe("fermee");
  });
});

describe("format du document d'espace", () => {
  it("F-002-AC20 un document d'espace rempli par la façade est relu à l'identique dans un document vierge", async () => {
    const original = creerFacade();
    const persistance = await ouvrirEtAttendre(original.doc, {
      type: "espace",
      idEspace: ESPACE_A,
    });
    const projets = original.creerPage("Projets");
    const notes = original.creerPage("Notes");
    const brouillon = original.creerPage("Brouillon", { parent: projets });
    const feuille = original.creerPage("Feuille", { parent: brouillon });
    original.renommerPage(brouillon, "Feuille de route");
    original.deplacerPage(notes, { parent: null, position: 0 });
    original.deplacerPage(feuille, { parent: projets, position: 0 });
    const archives = original.creerPage("Archives");
    original.creerPage("Ancienne note", { parent: archives });
    original.mettreALaCorbeille(archives);
    persistance.fermer();

    const relu = ouvrirFacade(new Y.Doc());
    await ouvrirEtAttendre(relu.doc, { type: "espace", idEspace: ESPACE_A });

    expect(relu.lire()).toEqual(original.lire());
    expect(relu.lire().racines.map((page) => page.titre)).toEqual(["Notes", "Projets"]);
    expect(relu.lire().corbeille.map((page) => page.titre)).toEqual(["Archives"]);
    expect([...Y.encodeStateAsUpdate(relu.doc)]).toEqual([...Y.encodeStateAsUpdate(original.doc)]);
    expect(await nomsDesBases()).toEqual([`notionlike:espace:${ESPACE_A}`]);
  });
});

describe("espace local", () => {
  it("F-002-AC2 la seconde ouverture relit l'identifiant inscrit par la première et la même base, pas son propre candidat", async () => {
    const premier = ouvrirFacade(new Y.Doc());
    const premiere = await ouvrirEspaceLocalEtAttendre(premier.doc, ESPACE_A);
    const parent = premier.creerPage("Parent");
    premier.creerPage("Enfant", { parent });
    premier.mettreALaCorbeille(premier.creerPage("Jetée"));
    premiere.fermer();
    expect(await espacesEnregistres()).toEqual([ESPACE_A]);

    const second = ouvrirFacade(new Y.Doc());
    await ouvrirEspaceLocalEtAttendre(second.doc, ESPACE_B);

    expect(second.lire()).toEqual(premier.lire());
    expect(second.lire().racines).toEqual([
      { id: parent, titre: "Parent", enfants: [expect.objectContaining({ titre: "Enfant" })] },
    ]);
    expect(second.lire().corbeille.map((page) => page.titre)).toEqual(["Jetée"]);
    expect(await espacesEnregistres()).toEqual([ESPACE_A]);
    expect(await nomsDesBases()).toEqual(["notionlike:appareil", `notionlike:espace:${ESPACE_A}`]);
  });

  it("F-002-AC4 deux ouvertures lancées ensemble retiennent le même espace, et chacune relit ensuite les deux pages dans le même ordre", async () => {
    const [ongletUn, ongletDeux] = [ouvrirFacade(new Y.Doc()), ouvrirFacade(new Y.Doc())];
    const persistanceUn = ouvrirEspaceLocal(ongletUn.doc, ESPACE_A);
    const persistanceDeux = ouvrirEspaceLocal(ongletDeux.doc, ESPACE_B);
    await Promise.all([
      attendreEtat(persistanceUn, "active"),
      attendreEtat(persistanceDeux, "active"),
    ]);
    ongletUn.creerPage("Page du premier onglet");
    ongletDeux.creerPage("Page du second onglet");
    persistanceUn.fermer();
    persistanceDeux.fermer();
    const retenus = await espacesEnregistres();

    const [rechargeUn, rechargeDeux] = [ouvrirFacade(new Y.Doc()), ouvrirFacade(new Y.Doc())];
    const relueUn = ouvrirEspaceLocal(rechargeUn.doc, crypto.randomUUID());
    const relueDeux = ouvrirEspaceLocal(rechargeDeux.doc, crypto.randomUUID());
    await Promise.all([attendreEtat(relueUn, "active"), attendreEtat(relueDeux, "active")]);

    expect(retenus).toHaveLength(1);
    expect([ESPACE_A, ESPACE_B]).toContain(retenus[0]);
    expect(
      rechargeUn
        .lire()
        .racines.map((page) => page.titre)
        .sort(),
    ).toEqual(["Page du premier onglet", "Page du second onglet"]);
    expect(rechargeDeux.lire()).toEqual(rechargeUn.lire());
    expect(await espacesEnregistres()).toEqual(retenus);
    expect(await nomsDesBases()).toEqual([
      "notionlike:appareil",
      `notionlike:espace:${String(retenus[0])}`,
    ]);
  });
});
