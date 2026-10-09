import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import {
  eleverVersionPage,
  ErreurDocument,
  lireVersionPage,
  ouvrirDocumentPage,
  TABLE_DES_VERSIONS_PAGE,
  VERSION_PAGE_PRISE_EN_CHARGE,
} from "../src/index.ts";

const ETAT_VIERGE = [0, 0];

function misesAJourEmises(doc: Y.Doc): Uint8Array[] {
  const emises: Uint8Array[] = [];
  doc.on("update", (miseAJour: Uint8Array) => emises.push(miseAJour));
  return emises;
}

function etatEncode(doc: Y.Doc): number[] {
  return [...Y.encodeStateAsUpdate(doc)];
}

function codeDuRefus(action: () => unknown): string | undefined {
  try {
    action();
  } catch (erreur) {
    return erreur instanceof ErreurDocument ? erreur.code : `autre erreur : ${String(erreur)}`;
  }
  return undefined;
}

describe("table des versions du document de page", () => {
  it("F-003-AC22 la ligne 1 liste les nœuds, leurs attributs triés, aucune marque et aucun type ajouté", () => {
    expect(TABLE_DES_VERSIONS_PAGE[0]).toEqual({
      version: 1,
      noeuds: {
        bulletList: [],
        doc: [],
        heading: ["level"],
        listItem: [],
        orderedList: ["start", "type"],
        paragraph: [],
        text: [],
      },
      marques: [],
      typesPartages: [],
    });
  });

  it("F-003-AC22 la version prise en charge est le numéro de la dernière ligne, et les lignes se suivent depuis 1", () => {
    const numeros = TABLE_DES_VERSIONS_PAGE.map((ligne) => ligne.version);

    expect(numeros).toEqual(numeros.map((_, indice) => indice + 1));
    expect(VERSION_PAGE_PRISE_EN_CHARGE).toBe(numeros.at(-1));
    expect(VERSION_PAGE_PRISE_EN_CHARGE).toBe(1);
  });
});

describe("ouvrir un document de page", () => {
  it("F-003-AC23 l'ouverture d'un document vierge n'écrit rien : aucune mise à jour, état encodé [0,0]", () => {
    const doc = new Y.Doc();
    const emises = misesAJourEmises(doc);

    ouvrirDocumentPage(doc);

    expect(emises).toEqual([]);
    expect(etatEncode(doc)).toEqual(ETAT_VIERGE);
  });

  it("F-003-AC23 la façade expose le document fourni et le fragment racine `contenu`", () => {
    const doc = new Y.Doc();

    const page = ouvrirDocumentPage(doc);

    expect(page.doc).toBe(doc);
    expect(page.contenu).toBeInstanceOf(Y.XmlFragment);
    expect(page.contenu).toBe(doc.getXmlFragment("contenu"));
    expect(Object.keys(page).sort()).toEqual(["contenu", "doc", "garderVersion"]);
  });

  it("F-003-AC23 un document où rien n'est inscrit est de version 1, avec ou sans contenu", () => {
    const doc = new Y.Doc();
    expect(lireVersionPage(doc)).toBe(1);

    ouvrirDocumentPage(doc).contenu.insert(0, [new Y.XmlElement("paragraph")]);

    expect(lireVersionPage(doc)).toBe(1);
    expect(ouvrirDocumentPage(doc).contenu.length).toBe(1);
  });

  it("F-003-AC23 la version lue est la plus haute inscrite, quel que soit l'ordre d'inscription", () => {
    const doc = new Y.Doc();
    doc.getArray("versions").push([3, 2, 5, 4]);

    expect(lireVersionPage(doc)).toBe(5);
  });

  it("F-003-AC23 F-003-AC19 une version lue au-delà de la version prise en charge est refusée sans rien écrire, octet pour octet", () => {
    const doc = new Y.Doc();
    eleverVersionPage(doc, VERSION_PAGE_PRISE_EN_CHARGE + 1);
    doc.getXmlFragment("contenu").insert(0, [new Y.XmlElement("noeudInconnu")]);
    const avant = etatEncode(doc);
    const emises = misesAJourEmises(doc);

    expect(codeDuRefus(() => ouvrirDocumentPage(doc))).toBe("version-non-prise-en-charge");

    expect(emises).toEqual([]);
    expect(etatEncode(doc)).toEqual(avant);
  });

  it("F-003-AC23 la version lue d'un document non pris en charge est rendue sans refus", () => {
    const doc = new Y.Doc();
    eleverVersionPage(doc, 7);

    expect(lireVersionPage(doc)).toBe(7);
  });

  it("F-003-AC23 un type racine `contenu` déjà lu avec un autre constructeur est refusé par l'erreur typée", () => {
    const doc = new Y.Doc();
    doc.getMap("contenu");

    expect(codeDuRefus(() => ouvrirDocumentPage(doc))).toBe("version-non-prise-en-charge");
  });

  it("F-003-AC23 un type racine `versions` déjà lu avec un autre constructeur : ouverture et élévation refusées, lecture sans exception", () => {
    const doc = new Y.Doc();
    doc.getMap("versions").set("version", 1);

    expect(codeDuRefus(() => ouvrirDocumentPage(doc))).toBe("version-non-prise-en-charge");
    expect(codeDuRefus(() => eleverVersionPage(doc, 2))).toBe("version-non-prise-en-charge");
    expect(lireVersionPage(doc)).toBe(1);
  });
});

describe("élever la version d'un document de page", () => {
  it("F-003-AC31 une version supérieure à la version lue est inscrite en une seule mise à jour", () => {
    const doc = new Y.Doc();
    const emises = misesAJourEmises(doc);

    eleverVersionPage(doc, 2);

    expect(lireVersionPage(doc)).toBe(2);
    expect(emises).toHaveLength(1);
  });

  it.each([
    { lue: 1, cible: 1 },
    { lue: 3, cible: 3 },
    { lue: 3, cible: 2 },
    { lue: 3, cible: 1 },
  ])(
    "F-003-AC31 élever à $cible un document de version $lue n'émet aucune mise à jour",
    ({ lue, cible }) => {
      const doc = new Y.Doc();
      eleverVersionPage(doc, lue);
      const avant = etatEncode(doc);
      const emises = misesAJourEmises(doc);

      eleverVersionPage(doc, cible);

      expect(emises).toEqual([]);
      expect(etatEncode(doc)).toEqual(avant);
      expect(lireVersionPage(doc)).toBe(lue);
    },
  );

  it.each([
    { nom: "zéro", cible: 0 },
    { nom: "un négatif", cible: -2 },
    { nom: "un décimal", cible: 2.5 },
    { nom: "NaN", cible: Number.NaN },
    { nom: "l'infini", cible: Number.POSITIVE_INFINITY },
    { nom: "une chaîne", cible: "2" as unknown as number },
    { nom: "undefined", cible: undefined as unknown as number },
  ])("F-003-AC31 $nom est refusé par `version-invalide`, sans rien écrire", ({ cible }) => {
    const doc = new Y.Doc();
    const emises = misesAJourEmises(doc);

    expect(codeDuRefus(() => eleverVersionPage(doc, cible))).toBe("version-invalide");

    expect(emises).toEqual([]);
    expect(etatEncode(doc)).toEqual(ETAT_VIERGE);
  });

  it("F-003-AC31 l'élévation n'est pas bornée par la version prise en charge", () => {
    const doc = new Y.Doc();

    eleverVersionPage(doc, VERSION_PAGE_PRISE_EN_CHARGE + 41);

    expect(lireVersionPage(doc)).toBe(VERSION_PAGE_PRISE_EN_CHARGE + 41);
  });

  it("F-003-AC31 l'élévation rejoint la transaction de l'appelant : une seule mise à jour avec le contenu", () => {
    const doc = new Y.Doc();
    const emises = misesAJourEmises(doc);

    doc.transact(() => {
      eleverVersionPage(doc, 2);
      doc.getXmlFragment("contenu").insert(0, [new Y.XmlElement("noeudNouveau")]);
    });

    expect(emises).toHaveLength(1);
    expect(lireVersionPage(doc)).toBe(2);
  });

  it("F-003-AC31 la version vit dans le type racine `versions`, jamais dans le fragment du contenu", () => {
    const doc = new Y.Doc();
    const { contenu } = ouvrirDocumentPage(doc);

    eleverVersionPage(doc, 2);
    eleverVersionPage(doc, 3);

    expect(contenu.length).toBe(0);
    expect(contenu.toJSON()).toBe("");
    expect([...doc.share.keys()].sort()).toEqual(["contenu", "versions"]);
    expect(doc.getArray("versions").toArray()).toEqual([2, 3]);
  });
});
