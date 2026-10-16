// F-029, compatibilité et contrat : tests de F-001 intacts, quinze exports inchangés, borne et rang
// non exportés, point unique d'écriture de la place, structure du paquet.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import manifeste from "../package.json" with { type: "json" };
import { type CodeErreurDocument, ErreurDocument } from "../src/index.ts";

// Les motifs sont assemblés : ce fichier, lu par les coutures du workspace, ne définit rien de ce
// qu'il cherche.
const FONCTION = "export function";

function texteDe(relatif: string): string {
  return readFileSync(new URL(relatif, import.meta.url), "utf8");
}

// Empreintes SHA-256 des tests de F-001 tels que F-029 les a trouvés (`8ec93ec`) : seul
// `rang.test.ts` pouvait être adapté (F-029-AC14).
const TESTS_DE_F001: Readonly<Record<string, string>> = {
  "operations.test.ts": "87a1da35b578674a82aea93f9c7b443d3ca3ac63d4d9350267d67653b41ea7e3",
  "abonnement.test.ts": "064870765bec51128943655b36d20bccb6f24ed642435476fb3e6fc4393f80a0",
  "convergence.test.ts": "f94ad5f5d1f9216eb5da5219fbe3716342289e2ce68230b7b2a0e427c7321c7c",
  "robustesse.test.ts": "f854147e6235a4e021deb916f96c9701b465e4d22c8f0110f9ca869a849f0fbb",
  "structure.test.ts": "4c87a48aa438251ab81fb272e796577fdf13b7a9adc504671ea0f3710d77741a",
};

describe("tests de F-001", () => {
  it.each(Object.entries(TESTS_DE_F001))(
    "F-029-AC14 %s n'est pas modifié",
    (fichier, empreinte) => {
      expect(
        createHash("sha256")
          .update(texteDe(`./${fichier}`))
          .digest("hex"),
      ).toBe(empreinte);
    },
  );

  it("F-029-AC14 rang.test.ts n'est adapté qu'à la forme du résultat : ses titres de test restent ceux de F-001", () => {
    const titres = [
      ...texteDe("./rang.test.ts").matchAll(/\bit(?:\.each\([^]*?\))?\(\s*"([^"]+)"/g),
    ].map(([, titre]) => titre);

    expect(titres).toEqual([
      "F-001-AC2 pour toutes bornes a < b, le rang calculé est valide et strictement entre a et b",
      "F-001-AC2 le rang calculé ne dépend que des deux bornes",
      "F-001-AC2 rang $cas",
      "F-001-AC8 pour toutes bornes a < b et tout n, la suite compte n rangs valides, strictement croissants, strictement entre a et b",
      "F-001-AC8 la suite d'un seul élément est le rang entre les deux bornes",
    ]);
  });
});

const EXPORTS_DU_PAQUET = [
  "Arborescence",
  "CodeErreurDocument",
  "DocumentEspace",
  "DocumentPage",
  "Emplacement",
  "ErreurDocument",
  "IdPage",
  "LigneDeVersionPage",
  "PageLue",
  "TABLE_DES_VERSIONS_PAGE",
  "VERSION_PAGE_PRISE_EN_CHARGE",
  "creerDocumentEspace",
  "lireVersionPage",
  "ouvrirDocumentEspace",
  "ouvrirDocumentPage",
  // F-017 : document de table.
  "ColonneLue",
  "DocumentTable",
  "IdColonne",
  "IdLigne",
  "IdOption",
  "LigneLue",
  "OptionLue",
  "TableLue",
  "TypeDeColonne",
  "ValeurDeCellule",
  "creerDocumentTable",
  "ouvrirDocumentTable",
];

/** Noms rendus par les `export { … } from` d'un module ; `*` signale un réexport entier. */
function nomsExportes(texte: string): string[] {
  const noms: string[] = [];
  for (const [, entier, clause = ""] of texte.matchAll(
    /\bexport\s+(?:type\s+)?(?:(\*)|\{([^}]*)\})/g,
  )) {
    if (entier !== undefined) {
      noms.push("*");
    }
    for (const element of clause.split(",")) {
      const [nom, alias] = element
        .replace(/^\s*type\s+/, "")
        .split(/\s+as\s+/)
        .map((partie) => partie.trim());
      if (nom) {
        noms.push(alias ?? nom);
      }
    }
  }
  return noms.sort();
}

describe("contrat public", () => {
  const ENTREE = 'export { a, type B } from "./x.ts";\n';

  it.each([
    [
      "un nom ajouté",
      `${ENTREE}export { LONGUEUR_MAX_RANG } from "./rang.ts";\n`,
      ["B", "LONGUEUR_MAX_RANG", "a"],
    ],
    ["un nom renommé", 'export { rangEntre as rang } from "./rang.ts";\n', ["rang"]],
    ["un réexport entier", 'export * from "./rang.ts";\n', ["*"]],
    ["un type seul", 'export type { Rang } from "./rang.ts";\n', ["Rang"]],
  ])("F-029-AC15 la lecture des exports voit %s", (_cas, texte, attendus) => {
    expect(nomsExportes(texte)).toEqual(attendus);
  });

  it("F-029-AC15 F-017-AC25 src/index.ts rend exactement les quinze noms de F-001 et F-003, plus les douze du document de table de F-017, ni borne, ni fonction de rang, ni entrée interne", () => {
    const noms = nomsExportes(texteDe("../src/index.ts"));

    expect(noms).toEqual([...EXPORTS_DU_PAQUET].sort());
    expect(texteDe("../src/index.ts")).not.toMatch(/rang|LONGUEUR|Borne|format\.ts/);
  });

  it("F-029-AC15 le seul ajout au contrat est le code rang-indisponible, porté par ErreurDocument", () => {
    const code: CodeErreurDocument = "rang-indisponible";
    const erreur = new ErreurDocument(code, "Aucun rang admis.");

    expect(erreur).toBeInstanceOf(Error);
    expect(erreur.code).toBe("rang-indisponible");
    expect(erreur.name).toBe("ErreurDocument");
    const union = /export type CodeErreurDocument =([^;]*);/.exec(
      texteDe("../src/erreurs.ts"),
    )?.[1];
    expect([...(union ?? "").matchAll(/"([^"]+)"/g)].map(([, nom]) => nom)).toEqual([
      "page-introuvable",
      "page-a-la-corbeille",
      "deplacement-cyclique",
      "titre-trop-long",
      "position-invalide",
      "version-non-prise-en-charge",
      "facade-fermee",
      "version-invalide",
      "rang-indisponible",
      // F-007 : code des opérations de corbeille sur une page qui n'y est pas.
      "page-hors-corbeille",
      // F-017 : refus du document de table.
      "pas-un-document-de-table",
      "type-de-colonne-inconnu",
      "nom-non-admis",
      "libelle-non-admis",
      "ligne-introuvable",
      "colonne-introuvable",
      "colonne-sans-options",
      "option-introuvable",
      "valeur-non-conforme",
    ]);
  });
});

// Un seul producteur de `PlaceAdmise` : la conversion de type n'apparaît qu'une fois, dans
// `admettrePlace`, et les deux écritures de `place` n'acceptent qu'une `PlaceAdmise`.
function producteursDePlaceAdmise(texte: string): number {
  return [...texte.matchAll(/\bas\s+PlaceAdmise\b/g)].length;
}

function ecrituresDePlaceAdmise(texte: string): string[] {
  return [...texte.matchAll(/export function (ecrire\w*)\(([^)]*)\)/g)]
    .filter(
      ([, , parametres = ""]) => /\bplace\b/.test(parametres) || /NouvellePage/.test(parametres),
    )
    .map(([, nom]) => nom ?? "");
}

describe("point unique d'écriture de la place", () => {
  it.each([
    ["deux conversions", "const a = x as PlaceAdmise;\nconst b = y as PlaceAdmise;\n", 2],
    ["aucune conversion", "const a = x as Place;\n", 0],
  ])("F-029-AC6 le compte des producteurs de PlaceAdmise voit %s", (_cas, texte, attendu) => {
    expect(producteursDePlaceAdmise(texte)).toBe(attendu);
  });

  it("F-029-AC6 dans src/, seule admettrePlace produit une PlaceAdmise, et ecrireNouvellePage comme ecrirePlace l'exigent", () => {
    const format = texteDe("../src/format.ts");
    const autres = [
      "arbre",
      "document-espace",
      "document-page",
      "erreurs",
      "format-page",
      "index",
      "rang",
    ];

    expect(producteursDePlaceAdmise(format)).toBe(1);
    expect(format).toMatch(
      new RegExp(`${FONCTION} admettrePlace\\([^)]*\\): PlaceAdmise \\{[^}]*estUnRang\\(`),
    );
    for (const module of autres) {
      expect(producteursDePlaceAdmise(texteDe(`../src/${module}.ts`)), module).toBe(0);
    }
    expect(ecrituresDePlaceAdmise(format)).toEqual(["ecrireNouvellePage", "ecrirePlace"]);
    expect(format).toMatch(
      new RegExp(`${FONCTION} ecrirePlace\\(doc: Y\\.Doc, id: IdPage, place: PlaceAdmise\\)`),
    );
    expect(format).toMatch(/interface NouvellePage \{[^}]*readonly place: PlaceAdmise;/);
    expect(format.match(/\.set\(CHAMP_PLACE, place\)/g)).toHaveLength(2);
  });
});

describe("structure", () => {
  it("F-029-AC17 yjs reste la seule dépendance d'exécution directe, et aucune dépendance n'est ajoutée", () => {
    expect(manifeste.dependencies).toEqual({ yjs: "13.6.33" });
    expect(Object.keys(manifeste.devDependencies).sort()).toEqual(["fast-check", "vitest"]);
  });

  it("F-029-AC10 F-029-AC15 l'entrée interne à borne abaissée est définie dans document-espace.ts et n'est pas réexportée", () => {
    expect(texteDe("../src/document-espace.ts")).toMatch(
      new RegExp(
        `${FONCTION} ouvrirDocumentEspaceBorne\\(doc: Y\\.Doc, borne: number\\): DocumentEspace`,
      ),
    );
    expect(texteDe("../src/document-espace.ts")).toMatch(
      new RegExp(
        `${FONCTION} ouvrirDocumentEspace\\(doc: Y\\.Doc\\): DocumentEspace \\{\\s*return ouvrirDocumentEspaceBorne\\(doc, LONGUEUR_MAX_RANG\\);\\s*\\}`,
      ),
    );
    expect(texteDe("../src/index.ts")).not.toMatch(/ouvrirDocumentEspaceBorne/);
  });
});
