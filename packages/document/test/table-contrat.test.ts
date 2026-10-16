// F-017-AC24, AC25 : structure du modèle de table et couture de l'interface publique. Chaque contrôle
// statique est éprouvé d'abord sur un cas fautif donné comme donnée.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import manifeste from "../package.json" with { type: "json" };
import {
  type CodeErreurDocument,
  creerDocumentTable,
  ErreurDocument,
  ouvrirDocumentTable,
} from "../src/index.ts";

const RACINE = new URL("../../../", import.meta.url);
const NOM_DU_PAQUET = "@notionlike/document";

function texteDe(relatif: string): string {
  return readFileSync(new URL(relatif, import.meta.url), "utf8");
}

// ── F-017-AC25 : exports et codes ─────────────────────────────────────────────────────────────────

const EXPORTS_DE_F001_ET_SUIVANTES = [
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
];
const EXPORTS_DE_F017 = [
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
const CODES_D_AVANT = [
  "page-introuvable",
  "page-a-la-corbeille",
  "deplacement-cyclique",
  "titre-trop-long",
  "position-invalide",
  "version-non-prise-en-charge",
  "facade-fermee",
  "version-invalide",
  "rang-indisponible",
  "page-hors-corbeille",
];
const CODES_DE_F017 = [
  "pas-un-document-de-table",
  "type-de-colonne-inconnu",
  "nom-non-admis",
  "libelle-non-admis",
  "ligne-introuvable",
  "colonne-introuvable",
  "colonne-sans-options",
  "option-introuvable",
  "valeur-non-conforme",
];

/** Noms rendus par les `export { … } from` et `export type { … } from` d'un module. */
function nomsExportes(texte: string): string[] {
  return [...texte.matchAll(/\bexport\s+(?:type\s+)?(?:(\*)|\{([^}]*)\})/g)]
    .flatMap(([, entier, clause = ""]) => [
      ...(entier === undefined ? [] : ["*"]),
      ...clause
        .split(",")
        .map(
          (element) =>
            element
              .replace(/^\s*type\s+/, "")
              .split(/\s+as\s+/)
              .at(-1)
              ?.trim() ?? "",
        )
        .filter((nom) => nom !== ""),
    ])
    .sort();
}

function codesDeLUnion(texte: string): string[] {
  const union = /export type CodeErreurDocument =([^;]*);/.exec(texte)?.[1] ?? "";
  return [...union.matchAll(/"([^"]+)"/g)].map(([, code = ""]) => code);
}

describe("contrat public", () => {
  it("F-017-AC25 la lecture des exports voit un nom de type ajouté, et la lecture des codes un code ajouté", () => {
    expect(
      nomsExportes('export type { A, B as C } from "./t.ts";\nexport { d } from "./d.ts";\n'),
    ).toEqual(["A", "C", "d"]);
    expect(codesDeLUnion('export type CodeErreurDocument =\n  | "a"\n  // c\n  | "b";')).toEqual([
      "a",
      "b",
    ]);
  });

  it("F-017-AC25 src/index.ts rend exactement les exports de F-001 et des features suivantes, plus les douze de F-017", () => {
    expect(nomsExportes(texteDe("../src/index.ts"))).toEqual(
      [...EXPORTS_DE_F001_ET_SUIVANTES, ...EXPORTS_DE_F017].sort(),
    );
  });

  it("F-017-AC25 la liste des codes est celle d'avant, dans le même ordre, suivie des neuf codes de la table", () => {
    expect(codesDeLUnion(texteDe("../src/erreurs.ts"))).toEqual([
      ...CODES_D_AVANT,
      ...CODES_DE_F017,
    ]);
    const code: CodeErreurDocument = "valeur-non-conforme";
    expect(new ErreurDocument(code, "x").code).toBe(code);
  });

  it("F-017-AC25 les refus de table repris de F-001 gardent leur code : position-invalide, version-non-prise-en-charge, facade-fermee", () => {
    const table = creerDocumentTable();
    const code = (operation: () => unknown) => {
      try {
        operation();
        return "aucun";
      } catch (erreur) {
        return erreur instanceof ErreurDocument ? erreur.code : "autre";
      }
    };

    expect(code(() => table.creerColonne("c", "texte", 5))).toBe("position-invalide");
    const ancienne = new Y.Doc();
    ancienne.getArray("versions").push([2]);
    expect(code(() => ouvrirDocumentTable(ancienne).lire())).toBe("version-non-prise-en-charge");
    table.fermer();
    expect(code(() => table.creerLigne())).toBe("facade-fermee");
  });
});

// ── F-017-AC25 : paquets du workspace qui dépendent du paquet ────────────────────────────────────

interface Manifeste {
  readonly name?: string;
  readonly scripts?: Readonly<Record<string, string>>;
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly devDependencies?: Readonly<Record<string, string>>;
  readonly peerDependencies?: Readonly<Record<string, string>>;
}

/** Les paquets, `dossier → manifeste`, dont l'un des trois champs de dépendances nomme le paquet. */
function dependantsDuPaquet(manifestes: ReadonlyMap<string, Manifeste>): string[] {
  return [...manifestes]
    .filter(([, lu]) =>
      [lu.dependencies, lu.devDependencies, lu.peerDependencies].some(
        (champ) => champ !== undefined && NOM_DU_PAQUET in champ,
      ),
    )
    .map(([dossier]) => dossier)
    .sort();
}

function manifestesDuWorkspace(): Map<string, Manifeste> {
  const manifestes = new Map<string, Manifeste>();
  for (const groupe of ["apps", "packages"]) {
    for (const dossier of readdirSync(new URL(`${groupe}/`, RACINE))) {
      const chemin = new URL(`${groupe}/${dossier}/package.json`, RACINE);
      if (existsSync(chemin)) {
        manifestes.set(
          `${groupe}/${dossier}`,
          JSON.parse(readFileSync(chemin, "utf8")) as Manifeste,
        );
      }
    }
  }
  return manifestes;
}

describe("paquets qui dépendent du document", () => {
  it("F-017-AC25 l'énumération voit une dépendance de développement et une dépendance de pair, et écarte les autres paquets", () => {
    const essais = new Map<string, Manifeste>([
      ["apps/x", { devDependencies: { [NOM_DU_PAQUET]: "workspace:*" } }],
      ["packages/y", { peerDependencies: { [NOM_DU_PAQUET]: "*" } }],
      ["packages/z", { dependencies: { yjs: "13.6.33" } }],
    ]);

    expect(dependantsDuPaquet(essais)).toEqual(["apps/x", "packages/y"]);
  });

  it("F-017-AC25 exactement apps/server et apps/web en dépendent : chacun passe sa vérification de types, et ses tests sont un projet du même pnpm test", () => {
    const manifestes = manifestesDuWorkspace();
    const dependants = dependantsDuPaquet(manifestes);
    expect(dependants).toEqual(["apps/server", "apps/web"]);

    const configuration = readFileSync(new URL("vitest.config.ts", RACINE), "utf8");
    for (const dossier of dependants) {
      const lu = manifestes.get(dossier) ?? {};
      expect(lu.scripts?.typecheck, dossier).toMatch(/\btsc\b/);
      expect(lu.scripts?.test, dossier).toMatch(/\bvitest\b/);
      expect(existsSync(new URL(`${dossier}/vitest.config.ts`, RACINE)), dossier).toBe(true);
      expect(configuration).toContain(`"${dossier.split("/")[0]}/*/vitest.config.ts"`);
      // Une erreur de types lève ici, avec la sortie du compilateur.
      execFileSync("pnpm", ["--filter", lu.name ?? dossier, "run", "typecheck"], {
        cwd: RACINE,
        stdio: "pipe",
      });
    }
  }, 60_000);
});

// ── F-017-AC24 : structure ───────────────────────────────────────────────────────────────────────

const COEUR_PUR = /^\.\/(rang|arbre|table|erreurs)\.ts$/;

/** Modules importés par un texte de module hors du cœur pur (`rang`, `arbre`, `table`, `erreurs`). */
function importsHorsDuCoeur(texte: string): string[] {
  return [
    ...texte.matchAll(
      /\b(?:import|export)\b[^"'`;]*?\bfrom\s*["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']/g,
    ),
  ]
    .map(([, statique, dynamique]) => statique ?? dynamique ?? "")
    .filter((source) => !COEUR_PUR.test(source));
}

/** Types de Yjs nommés par un texte, hors `Y.Doc`. */
function typesYjsAutresQueDoc(texte: string): string[] {
  return [...texte.matchAll(/\bY\.([A-Za-z]+)/g)]
    .map(([, nom = ""]) => nom)
    .filter((nom) => nom !== "Doc");
}

function interfaceDocumentTable(texte: string): string {
  return /export interface DocumentTable \{[^]*?\n\}/.exec(texte)?.[0] ?? "";
}

describe("structure", () => {
  it.each([
    ["yjs", 'import * as Y from "yjs";\n', ["yjs"]],
    ["le format", 'import { lireEntrees } from "./format-table.ts";\n', ["./format-table.ts"]],
    [
      "un import dynamique",
      'const m = await import("./document-table.ts");\n',
      ["./document-table.ts"],
    ],
    ["un voisin", 'export { x } from "./tableau.ts";\n', ["./tableau.ts"]],
    [
      "le cœur pur",
      'import { estUnRang } from "./rang.ts";\nimport type { X } from "./erreurs.ts";\n',
      [],
    ],
  ])("F-017-AC24 le contrôle de pureté voit %s", (_cas, texte, attendus) => {
    expect(importsHorsDuCoeur(texte)).toEqual(attendus);
  });

  it("F-017-AC24 table.ts n'importe rien hors du cœur pur (règle document-coeur-pur proposée par la conception)", () => {
    expect(importsHorsDuCoeur(texteDe("../src/table.ts"))).toEqual([]);
  });

  it("F-017-AC24 le contrôle des types Yjs exposés voit un type partagé dans l'interface", () => {
    expect(
      typesYjsAutresQueDoc("readonly doc: Y.Doc;\nreadonly cellules: Y.Map<unknown>;\n"),
    ).toEqual(["Map"]);
    expect(interfaceDocumentTable("export interface DocumentTable {\n  a: Y.Text;\n}\n")).toContain(
      "Y.Text",
    );
  });

  it("F-017-AC24 aucun type Yjs autre que Y.Doc n'est exposé : ni par l'interface DocumentTable, ni par les types publics de table.ts, ni par index.ts", () => {
    const facade = interfaceDocumentTable(texteDe("../src/document-table.ts"));

    expect(facade).toMatch(/readonly doc: Y\.Doc;/);
    expect(typesYjsAutresQueDoc(facade)).toEqual([]);
    expect(texteDe("../src/table.ts")).not.toMatch(/\bY\.|yjs/);
    expect(texteDe("../src/index.ts")).not.toMatch(/format-table|from "yjs"/);
    // À l'exécution aussi : hors de `doc`, la façade ne porte que des fonctions.
    const membres = Object.entries(creerDocumentTable()).filter(([cle]) => cle !== "doc");
    expect(membres.filter(([, valeur]) => typeof valeur !== "function")).toEqual([]);
  });

  it("F-017-AC24 yjs reste la seule dépendance d'exécution directe, et le modèle s'exécute sous Node sans DOM", () => {
    expect(manifeste.dependencies).toEqual({ yjs: "13.6.33" });
    expect("window" in globalThis).toBe(false);
    expect("document" in globalThis).toBe(false);
    expect("indexedDB" in globalThis).toBe(false);
    expect(creerDocumentTable().lire()).toEqual({ colonnes: [], lignes: [] });
  });

  it("F-017-AC24 pnpm contrats finit sans violation", () => {
    const sortie = execFileSync("pnpm", ["contrats"], {
      cwd: RACINE,
      encoding: "utf8",
      stdio: "pipe",
    });

    expect(sortie).toMatch(/no dependency violations found/);
  }, 60_000);
});
