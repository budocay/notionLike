import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import manifeste from "../package.json" with { type: "json" };
import {
  type CodeErreurDocument,
  lireVersionPage,
  TABLE_DES_VERSIONS_PAGE,
  VERSION_PAGE_PRISE_EN_CHARGE,
} from "../src/index.ts";
import {
  codeDuRefusDe,
  docDuClient,
  livrerLEtat,
  misesAJourDe,
  ouvrirPageSuivie,
  recevoirLaVersion,
} from "./aides-page.ts";

// Noms des types racine du document de page, écrits ici comme le ferait une réplique forgée.
const TYPE_DES_VERSIONS = "versions";
const TYPE_DU_CONTENU = "contenu";

function etatEncode(doc: Y.Doc): number[] {
  return [...Y.encodeStateAsUpdate(doc)];
}

function docDeVersion(version: number): Y.Doc {
  const doc = new Y.Doc();
  recevoirLaVersion(doc, version);
  return doc;
}

describe("table des versions du document de page", () => {
  it("F-003-AC22 la ligne 1 porte les sept nœuds, leurs attributs, aucune marque et aucun type partagé, et la version prise en charge est le numéro de la dernière ligne", () => {
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
    expect(TABLE_DES_VERSIONS_PAGE.map((ligne) => ligne.version)).toEqual(
      TABLE_DES_VERSIONS_PAGE.map((_, rang) => rang + 1),
    );
    expect(VERSION_PAGE_PRISE_EN_CHARGE).toBe(TABLE_DES_VERSIONS_PAGE.at(-1)?.version);
    expect(VERSION_PAGE_PRISE_EN_CHARGE).toBe(1);
  });
});

describe("lecture de la version d'un document de page", () => {
  it("F-003-AC23 un document sans version écrite est de version 1, et son ouverture n'écrit rien", () => {
    const doc = new Y.Doc();
    const emises = misesAJourDe(doc);
    const avant = etatEncode(doc);

    const page = ouvrirPageSuivie(doc);

    expect(page.lireVersion()).toBe(1);
    expect(lireVersionPage(doc)).toBe(1);
    expect(page.doc).toBe(doc);
    expect(page.contenu).toBeInstanceOf(Y.XmlFragment);
    expect(page.contenu.length).toBe(0);
    expect(emises).toEqual([]);
    expect(etatEncode(doc)).toEqual(avant);
  });

  it("F-003-AC23 la version lue est la plus haute jamais inscrite, quel que soit l'ordre des inscriptions", () => {
    const doc = new Y.Doc();
    const page = ouvrirPageSuivie(doc);

    page.eleverVersion(4);
    recevoirLaVersion(doc, 2);
    recevoirLaVersion(doc, 3);

    expect(page.lireVersion()).toBe(4);
    expect(lireVersionPage(doc)).toBe(4);
  });

  it("F-003-AC23 un document dont la version lue dépasse la version prise en charge est refusé à l'ouverture, sans écriture, et sa version reste lisible sans refus", () => {
    const doc = docDeVersion(VERSION_PAGE_PRISE_EN_CHARGE + 1);
    const emises = misesAJourDe(doc);
    const avant = etatEncode(doc);

    expect(codeDuRefusDe(() => ouvrirPageSuivie(doc))).toBe("version-non-prise-en-charge");

    expect(lireVersionPage(doc)).toBe(VERSION_PAGE_PRISE_EN_CHARGE + 1);
    expect(emises).toEqual([]);
    expect(etatEncode(doc)).toEqual(avant);
  });

  it.each([
    ["zéro", 0],
    ["un nombre négatif", -1],
    ["un nombre non entier", 1.5],
    ["une chaîne", "2"],
    ["une valeur nulle", null],
    ["un objet", { version: 1 }],
  ])(
    "F-003-AC23 une forme stockée qui porte %s est refusée à l'ouverture, et la lecture de la version ne lève pas",
    (_cas, valeur) => {
      const doc = new Y.Doc();
      doc.getArray<unknown>(TYPE_DES_VERSIONS).push([valeur]);
      const emises = misesAJourDe(doc);

      expect(codeDuRefusDe(() => ouvrirPageSuivie(doc))).toBe("version-non-prise-en-charge");
      expect(lireVersionPage(doc)).toBe(1);
      expect(emises).toEqual([]);
    },
  );

  it("F-003-AC23 une valeur mal formée à côté d'une version entière ne masque pas celle-ci : la version lue reste la plus haute entière, l'ouverture est refusée", () => {
    const doc = new Y.Doc();
    doc.getArray<unknown>(TYPE_DES_VERSIONS).push([1, "x"]);

    expect(lireVersionPage(doc)).toBe(1);
    expect(codeDuRefusDe(() => ouvrirPageSuivie(doc))).toBe("version-non-prise-en-charge");
  });

  it.each([
    ["le type des versions", (doc: Y.Doc) => doc.getMap(TYPE_DES_VERSIONS)],
    ["le fragment du contenu", (doc: Y.Doc) => doc.getMap(TYPE_DU_CONTENU)],
  ])(
    "F-003-AC23 un document où %s a déjà été lu sous un autre type partagé est refusé, sans exception d'une autre sorte",
    (_cas, lireAutrement) => {
      const doc = new Y.Doc();
      lireAutrement(doc);

      expect(codeDuRefusDe(() => ouvrirPageSuivie(doc))).toBe("version-non-prise-en-charge");
      expect(lireVersionPage(doc)).toBe(1);
    },
  );

  it("F-003-AC23 le fragment du contenu est le type racine où une réplique écrit ses blocs, distinct du type des versions", () => {
    const doc = new Y.Doc();
    const page = ouvrirPageSuivie(doc);

    page.contenu.insert(0, [new Y.XmlElement("paragraph")]);

    expect(doc.getXmlFragment(TYPE_DU_CONTENU).length).toBe(1);
    expect(doc.getArray(TYPE_DES_VERSIONS).length).toBe(0);
    expect(page.lireVersion()).toBe(1);
  });

  it("F-003-AC23 le paquet s'exécute sous Node sans DOM, avec yjs pour seule dépendance d'exécution", () => {
    expect("window" in globalThis).toBe(false);
    expect("document" in globalThis).toBe(false);
    expect(Object.keys(manifeste.dependencies)).toEqual(["yjs"]);
  });
});

interface Repartition {
  readonly clientQuiEleveA2: number;
  readonly clientQuiEleveA3: number;
}

describe("élévation de la version d'un document de page", () => {
  it.each<[string, Repartition]>([
    ["le plus grand identifiant élève à 3", { clientQuiEleveA2: 1, clientQuiEleveA3: 2 }],
    ["le plus grand identifiant élève à 2", { clientQuiEleveA2: 2, clientQuiEleveA3: 1 }],
  ])(
    "F-003-AC31 deux répliques élevées séparément à 2 et à 3 lisent 3 après convergence, dans les deux ordres, comme un troisième document vierge (%s)",
    (_cas, { clientQuiEleveA2, clientQuiEleveA3 }) => {
      const a = docDuClient(clientQuiEleveA2);
      const b = docDuClient(clientQuiEleveA3);
      const pageA = ouvrirPageSuivie(a);
      const pageB = ouvrirPageSuivie(b);
      pageA.eleverVersion(2);
      pageB.eleverVersion(3);
      const deA = Y.encodeStateAsUpdate(a);
      const deB = Y.encodeStateAsUpdate(b);
      expect(lireVersionPage(a)).toBe(2);
      expect(lireVersionPage(b)).toBe(3);

      const tiersAPuisB = docDuClient(10);
      const tiersBPuisA = docDuClient(11);
      Y.applyUpdate(tiersAPuisB, deA);
      Y.applyUpdate(tiersAPuisB, deB);
      Y.applyUpdate(tiersBPuisA, deB);
      Y.applyUpdate(tiersBPuisA, deA);
      livrerLEtat(a, b);
      livrerLEtat(b, a);

      const tous = [a, b, tiersAPuisB, tiersBPuisA];
      expect(tous.map(lireVersionPage)).toEqual([3, 3, 3, 3]);
      expect([pageA.lireVersion(), pageB.lireVersion()]).toEqual([3, 3]);
      expect(tous.map((doc) => codeDuRefusDe(() => ouvrirPageSuivie(doc)))).toEqual(
        tous.map(() => "version-non-prise-en-charge"),
      );
      const relu = new Y.Doc();
      Y.applyUpdate(relu, Y.encodeStateAsUpdate(a));
      expect(lireVersionPage(relu)).toBe(3);
    },
  );

  it("F-003-AC31 l'échange dans l'ordre inverse (la réplique à 3 reçoit d'abord) donne la même lecture", () => {
    const a = docDuClient(1);
    const b = docDuClient(2);
    ouvrirPageSuivie(a).eleverVersion(2);
    ouvrirPageSuivie(b).eleverVersion(3);

    livrerLEtat(b, a);
    livrerLEtat(a, b);

    expect([lireVersionPage(a), lireVersionPage(b)]).toEqual([3, 3]);
  });

  it("F-003-AC31 une version inférieure ou égale à la version lue n'émet aucune mise à jour", () => {
    const doc = new Y.Doc();
    const page = ouvrirPageSuivie(doc);
    page.eleverVersion(3);
    const emises = misesAJourDe(doc);

    page.eleverVersion(3);
    page.eleverVersion(2);
    page.eleverVersion(1);

    expect(emises).toEqual([]);
    expect(page.lireVersion()).toBe(3);
  });

  it("F-003-AC31 une version 1 demandée sur un document jamais élevé n'inscrit rien", () => {
    const doc = new Y.Doc();
    const emises = misesAJourDe(doc);

    ouvrirPageSuivie(doc).eleverVersion(1);

    expect(emises).toEqual([]);
    expect(doc.getArray(TYPE_DES_VERSIONS).length).toBe(0);
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, "2" as unknown as number])(
    "F-003-AC31 la version %s, qui n'est pas un entier supérieur ou égal à 1, est refusée par version-invalide sans rien écrire",
    (version) => {
      const doc = new Y.Doc();
      const page = ouvrirPageSuivie(doc);
      const emises = misesAJourDe(doc);

      expect(codeDuRefusDe(() => page.eleverVersion(version))).toBe("version-invalide");

      expect(emises).toEqual([]);
      expect(page.lireVersion()).toBe(1);
    },
  );

  it("F-003-AC31 l'élévation n'est pas bornée par la version prise en charge, et émet une seule mise à jour", () => {
    const doc = new Y.Doc();
    const page = ouvrirPageSuivie(doc);
    const emises = misesAJourDe(doc);

    page.eleverVersion(VERSION_PAGE_PRISE_EN_CHARGE + 6);

    expect(emises).toHaveLength(1);
    expect(page.lireVersion()).toBe(VERSION_PAGE_PRISE_EN_CHARGE + 6);
  });
});

// Exhaustif par le type : un code ajouté ou retiré sans retouche de cette liste ne compile plus.
const CODES_ATTENDUS = Object.keys({
  "page-introuvable": true,
  "page-a-la-corbeille": true,
  "deplacement-cyclique": true,
  "titre-trop-long": true,
  "position-invalide": true,
  "version-non-prise-en-charge": true,
  "facade-fermee": true,
  "version-invalide": true,
  "rang-indisponible": true,
} satisfies Record<CodeErreurDocument, true>);

describe("codes d'erreur du paquet", () => {
  it("F-003-AC24 F-029-AC16 la liste des codes est celle de F-002, les sept, plus version-invalide et rang-indisponible", () => {
    expect(CODES_ATTENDUS).toEqual([
      "page-introuvable",
      "page-a-la-corbeille",
      "deplacement-cyclique",
      "titre-trop-long",
      "position-invalide",
      "version-non-prise-en-charge",
      "facade-fermee",
      "version-invalide",
      "rang-indisponible",
    ]);
  });
});
