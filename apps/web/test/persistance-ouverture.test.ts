import { creerDocumentEspace, ouvrirDocumentEspace } from "@notionlike/document";
import { describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

import {
  type DesignationDocument,
  ErreurPersistance,
  ouvrirEspaceLocal,
  ouvrirPersistance,
} from "../src/persistance/index.ts";
import {
  attendreEtat,
  enregistrements,
  ESPACE_A,
  ESPACE_B,
  nomsDesBases,
} from "./aides-persistance.ts";

const PAGE_AVEC_DEUX_POINTS = "page:avec:deux-points";
const DOCUMENT_VIDE = [0, 0];

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

describe("nom des bases", () => {
  it("F-002-AC25 nomme la base d'un espace, d'une page et d'une table par le type et les identifiants", async () => {
    await ouvrirEtAttendre(new Y.Doc(), { type: "espace", idEspace: ESPACE_A });
    await ouvrirEtAttendre(new Y.Doc(), { type: "page", idEspace: ESPACE_A, idPage: "p1" });
    await ouvrirEtAttendre(new Y.Doc(), { type: "table", idEspace: ESPACE_A, idTable: "t1" });

    expect(await nomsDesBases()).toEqual([
      `notionlike:espace:${ESPACE_A}`,
      `notionlike:page:${ESPACE_A}:p1`,
      `notionlike:table:${ESPACE_A}:t1`,
    ]);
  });

  it("F-002-AC25 la page d'un espace A reste invisible et inchangée quand un espace B ouvre le même identifiant de page, même avec « : »", async () => {
    const docDeA = new Y.Doc();
    const persistanceDeA = await ouvrirEtAttendre(docDeA, {
      type: "page",
      idEspace: ESPACE_A,
      idPage: PAGE_AVEC_DEUX_POINTS,
    });
    docDeA.getMap("temoin").set("contenu", "secret de A");
    persistanceDeA.fermer();
    const baseDeA = `notionlike:page:${ESPACE_A}:${PAGE_AVEC_DEUX_POINTS}`;
    const avant = await enregistrements(baseDeA);

    const docDeB = new Y.Doc();
    await ouvrirEtAttendre(docDeB, {
      type: "page",
      idEspace: ESPACE_B,
      idPage: PAGE_AVEC_DEUX_POINTS,
    });

    expect([...Y.encodeStateAsUpdate(docDeB)]).toEqual(DOCUMENT_VIDE);
    expect(docDeB.getMap("temoin").size).toBe(0);
    expect(await nomsDesBases()).toEqual(
      [baseDeA, `notionlike:page:${ESPACE_B}:${PAGE_AVEC_DEUX_POINTS}`].sort(),
    );
    expect(avant.some((enregistrement) => enregistrement.length > DOCUMENT_VIDE.length)).toBe(true);
    expect(await enregistrements(baseDeA)).toEqual(avant);
  });

  it("F-002-AC25 un identifiant de page qui imite un autre espace ne sort pas de l'espace demandé", async () => {
    const idPage = `x:${ESPACE_B}:y`;
    await ouvrirEtAttendre(new Y.Doc(), { type: "page", idEspace: ESPACE_A, idPage });

    expect(await nomsDesBases()).toEqual([`notionlike:page:${ESPACE_A}:${idPage}`]);
  });

  it.each([
    ["vide", ""],
    ["trop court", ESPACE_A.slice(0, -1)],
    ["en majuscules", ESPACE_A.toUpperCase()],
    ["suivi de « :page »", `${ESPACE_A}:page`],
    ["précédé d'une espace", ` ${ESPACE_A}`],
    ["suivi d'un saut de ligne", `${ESPACE_A}\n`],
    ["sans tirets", ESPACE_A.replaceAll("-", "")],
    ["entre accolades", `{${ESPACE_A}}`],
  ])(
    "F-002-AC25 refuse un identifiant d'espace %s sans ouvrir ni créer aucune base",
    async (_cas, idEspace) => {
      const ouvertures = vi.spyOn(indexedDB, "open");
      const designations: DesignationDocument[] = [
        { type: "espace", idEspace },
        { type: "page", idEspace, idPage: "p1" },
        { type: "table", idEspace, idTable: "t1" },
      ];

      for (const designation of designations) {
        expect(() => ouvrirPersistance(new Y.Doc(), designation)).toThrow(ErreurPersistance);
      }
      expect(() => ouvrirEspaceLocal(new Y.Doc(), idEspace)).toThrow(
        expect.objectContaining({ code: "identifiant-espace-invalide" }),
      );
      expect(ouvertures).not.toHaveBeenCalled();
      expect(await nomsDesBases()).toEqual([]);
    },
  );
});

describe("états d'une persistance", () => {
  it("F-002-AC22 passe de « relecture » à « active » en prévenant ses abonnés, et plus ceux qui se sont désabonnés", async () => {
    const abonne = vi.fn();
    const desabonne = vi.fn();
    const persistance = ouvrirPersistance(new Y.Doc(), { type: "espace", idEspace: ESPACE_A });
    persistance.abonner(abonne);
    persistance.abonner(desabonne)();

    expect(persistance.etat()).toBe("relecture");
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

    expect(persistance.etat()).toBe("fermee");
    expect(abonne).toHaveBeenCalledTimes(1);
    expect(await enregistrements(`notionlike:espace:${ESPACE_A}`)).toEqual(avant);
  });

  it("F-002-AC22 fermée pendant la relecture, une persistance ne devient jamais active", async () => {
    const doc = new Y.Doc();
    const persistance = ouvrirPersistance(doc, { type: "espace", idEspace: ESPACE_A });

    persistance.fermer();
    const suivante = await ouvrirEtAttendre(new Y.Doc(), { type: "espace", idEspace: ESPACE_A });

    expect(suivante.etat()).toBe("active");
    expect(persistance.etat()).toBe("fermee");
  });
});

describe("format du document d'espace", () => {
  it("F-002-AC20 un document d'espace rempli par la façade est relu à l'identique dans un document vierge", async () => {
    const original = creerDocumentEspace();
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

    const relu = ouvrirDocumentEspace(new Y.Doc());
    await ouvrirEtAttendre(relu.doc, { type: "espace", idEspace: ESPACE_A });

    expect(relu.lire()).toEqual(original.lire());
    expect(relu.lire().racines.map((page) => page.titre)).toEqual(["Notes", "Projets"]);
    expect(relu.lire().corbeille.map((page) => page.titre)).toEqual(["Archives"]);
    expect([...Y.encodeStateAsUpdate(relu.doc)]).toEqual([...Y.encodeStateAsUpdate(original.doc)]);
    expect(await nomsDesBases()).toEqual([`notionlike:espace:${ESPACE_A}`]);
  });
});

describe("espace local", () => {
  it("F-002-AC2 la seconde ouverture relit l'identifiant inscrit par la première et la même base", async () => {
    const premier = ouvrirDocumentEspace(new Y.Doc());
    const premiere = await ouvrirEspaceLocalEtAttendre(premier.doc, ESPACE_A);
    const parent = premier.creerPage("Parent");
    premier.creerPage("Enfant", { parent });
    premier.mettreALaCorbeille(premier.creerPage("Jetée"));
    premiere.fermer();

    const second = ouvrirDocumentEspace(new Y.Doc());
    const seconde = ouvrirEspaceLocal(second.doc, ESPACE_B);
    expect(seconde.idEspace()).toBe(ESPACE_B);
    await attendreEtat(seconde, "active");

    expect(premiere.idEspace()).toBe(ESPACE_A);
    expect(seconde.idEspace()).toBe(ESPACE_A);
    expect(second.lire()).toEqual(premier.lire());
    expect(second.lire().racines).toEqual([
      { id: parent, titre: "Parent", enfants: [expect.objectContaining({ titre: "Enfant" })] },
    ]);
    expect(await nomsDesBases()).toEqual(["notionlike:appareil", `notionlike:espace:${ESPACE_A}`]);
  });

  it("F-002-AC4 deux ouvertures lancées ensemble retiennent le même espace, et chacune relit ensuite les deux pages dans le même ordre", async () => {
    const [ongletUn, ongletDeux] = [
      ouvrirDocumentEspace(new Y.Doc()),
      ouvrirDocumentEspace(new Y.Doc()),
    ];
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

    const [rechargeUn, rechargeDeux] = [
      ouvrirDocumentEspace(new Y.Doc()),
      ouvrirDocumentEspace(new Y.Doc()),
    ];
    const relueUn = ouvrirEspaceLocal(rechargeUn.doc, crypto.randomUUID());
    const relueDeux = ouvrirEspaceLocal(rechargeDeux.doc, crypto.randomUUID());
    await Promise.all([attendreEtat(relueUn, "active"), attendreEtat(relueDeux, "active")]);

    const idEspace = persistanceUn.idEspace();
    expect([persistanceDeux.idEspace(), relueUn.idEspace(), relueDeux.idEspace()]).toEqual([
      idEspace,
      idEspace,
      idEspace,
    ]);
    expect(
      rechargeUn
        .lire()
        .racines.map((page) => page.titre)
        .sort(),
    ).toEqual(["Page du premier onglet", "Page du second onglet"]);
    expect(rechargeDeux.lire()).toEqual(rechargeUn.lire());
    expect(await nomsDesBases()).toEqual(["notionlike:appareil", `notionlike:espace:${idEspace}`]);
  });
});
