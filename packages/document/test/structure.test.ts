import { describe, expect, it } from "vitest";

import manifeste from "../package.json" with { type: "json" };
import * as paquet from "../src/index.ts";
import type { CodeErreurDocument } from "../src/index.ts";

// Un code ajouté ou retiré de l'union ne compile plus ici : la liste est exhaustive par le type.
const CODES_D_ERREUR: Record<CodeErreurDocument, true> = {
  "deplacement-cyclique": true,
  "page-a-la-corbeille": true,
  "page-introuvable": true,
  "position-invalide": true,
  "titre-trop-long": true,
  "version-invalide": true,
  "version-non-prise-en-charge": true,
};

describe("structure du paquet", () => {
  it("F-001-AC19 yjs est la seule dépendance d'exécution directe du manifeste", () => {
    expect(Object.keys(manifeste.dependencies)).toEqual(["yjs"]);
  });

  it("F-001-AC19 les tests s'exécutent sous Node sans DOM", () => {
    expect("window" in globalThis).toBe(false);
    expect("document" in globalThis).toBe(false);
  });

  it("F-003-AC24 les exports du paquet sont ceux de F-001, inchangés, plus ceux du document de page", () => {
    expect(Object.keys(paquet).sort()).toEqual([
      "ErreurDocument",
      "TABLE_DES_VERSIONS_PAGE",
      "VERSION_PAGE_PRISE_EN_CHARGE",
      "creerDocumentEspace",
      "eleverVersionPage",
      "lireVersionPage",
      "ouvrirDocumentEspace",
      "ouvrirDocumentPage",
    ]);
  });

  it("F-003-AC24 les codes d'erreur sont ceux de F-001, inchangés, plus `version-invalide`", () => {
    expect(Object.keys(CODES_D_ERREUR)).toEqual([
      "deplacement-cyclique",
      "page-a-la-corbeille",
      "page-introuvable",
      "position-invalide",
      "titre-trop-long",
      "version-invalide",
      "version-non-prise-en-charge",
    ]);
  });
});
