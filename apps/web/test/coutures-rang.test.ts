// Coutures de F-029 (rang borné, F-029-AC16) : dans tout le workspace, code et tests, les appelants
// du calcul et du contrôle d'un rang, les points d'écriture de `place` et leurs appelants, les
// modules qui lisent les types racines du document d'espace, et ceux qui distinguent un code
// d'`ErreurDocument`. Chaque liste est fermée, et chaque module inscrit est couvert par un test de
// F-029. Les fichiers sont lus comme du texte, comme dans `coutures.test.ts`.
import { type CodeErreurDocument, ErreurDocument } from "@notionlike/document";
import { describe, expect, it } from "vitest";

import { messageErreur } from "../src/interface/messages.ts";
import { depuisLaRacine, lireLesFichiersDuWorkspace } from "./aides-coutures.ts";
import { NOMS_DU_FORMAT } from "./aides-format.ts";

const ICI = "apps/web/test";
const CE_FICHIER = `${ICI}/coutures-rang.test.ts`;
const RANG = "packages/document/src/rang.ts";
const FORMAT = "packages/document/src/format.ts";
const FACADE = "packages/document/src/document-espace.ts";
const FACADE_TABLE = "packages/document/src/document-table.ts";
const FORMAT_TABLE = "packages/document/src/format-table.ts";
const TEST_DU_RANG_DE_TABLE = "packages/document/test/table-rang.test.ts";
const NOMS_D_ECRITURE = ["ecrireNouvellePage", "ecrirePlace", "admettrePlace"];
const ENTREE_A_BORNE = "ouvrirDocumentEspaceBorne";
// Les essais sont assemblés : ce fichier, lu lui aussi, ne définit ni ne nomme ce qu'il énumère.
const FONCTION = "function";

const fichiers = lireLesFichiersDuWorkspace();

function texteDe(chemin: string): string {
  const texte = fichiers.get(chemin);
  if (texte === undefined) {
    throw new Error(`fichier non lu : ${chemin}`);
  }
  return texte;
}

interface Declaration {
  readonly noms: readonly string[];
  readonly vise: string;
}

const DECLARATION = /(?:^|;)[ \t]*(?:import|export)\b([^"'`;]*?)\bfrom\s*["']([^"']+)["']/gm;

// Le module visé par chaque déclaration, résolu depuis la racine quand il est relatif, et les noms
// qu'elle fait entrer, avant tout renommage.
function declarationsDe(chemin: string, texte: string): Declaration[] {
  const dossier = chemin.slice(0, chemin.lastIndexOf("/"));
  return [...texte.matchAll(DECLARATION)].map(([, clause = "", source = ""]) => ({
    noms: (/\{([^}]*)\}/.exec(clause)?.[1] ?? "")
      .split(",")
      .map((element) => /^\s*(?:type\s+)?([\w$]+)/.exec(element)?.[1] ?? "")
      .filter((nom) => nom !== ""),
    vise: source.startsWith(".") ? depuisLaRacine(dossier, source) : source,
  }));
}

function definit(texte: string, nom: string): boolean {
  return new RegExp(`\\bfunction\\s+${nom}\\b`).test(texte);
}

type Textes = ReadonlyMap<string, string> | Iterable<[string, string]>;

function filtrer(textes: Textes, critere: (chemin: string, texte: string) => boolean): string[] {
  return [...textes]
    .filter(([chemin, texte]) => critere(chemin, texte))
    .map(([chemin]) => chemin)
    .sort();
}

/** (a) Les fichiers qui importent le module de rang : calcul (`rangEntre`…) ou contrôle (`estUnRang`). */
function appelantsDuRang(textes: Textes): string[] {
  return filtrer(textes, (chemin, texte) =>
    declarationsDe(chemin, texte).some(({ vise }) => vise === RANG),
  );
}

/** (b) Les fichiers qui définissent ou font entrer une écriture de `place`. */
function ecrivainsDePlace(textes: Textes): string[] {
  return filtrer(
    textes,
    (chemin, texte) =>
      NOMS_D_ECRITURE.some((nom) => definit(texte, nom)) ||
      declarationsDe(chemin, texte).some(({ noms }) =>
        noms.some((nom) => NOMS_D_ECRITURE.includes(nom)),
      ),
  );
}

/** (c) Les modules de src/ qui lisent un type racine du `Y.Doc` ou en citent le nom en chaîne. */
function lecteursDesTypesRacines(textes: Textes): string[] {
  return filtrer(
    textes,
    (chemin, texte) =>
      /^(apps|packages)\/[^/]+\/src\//.test(chemin) &&
      (/\bgetMap\s*\(/.test(texte) || /["'`](meta|pages)["'`]/.test(texte)),
  );
}

/** (d) Les modules de src/, hors du paquet du document, qui nomment l'erreur ou ses codes. */
function distinguentUnCode(textes: Textes): string[] {
  return filtrer(
    textes,
    (chemin, texte) =>
      /^(apps|packages)\/[^/]+\/src\//.test(chemin) &&
      !chemin.startsWith("packages/document/") &&
      /\b(ErreurDocument|CodeErreurDocument)\b/.test(texte),
  );
}

/** Les fichiers qui définissent ou font entrer l'entrée interne à borne abaissée. */
function ouvrantsABorne(textes: Textes): string[] {
  return filtrer(
    textes,
    (chemin, texte) =>
      definit(texte, ENTREE_A_BORNE) ||
      declarationsDe(chemin, texte).some(({ noms }) => noms.includes(ENTREE_A_BORNE)),
  );
}

// Chaque module inscrit, avec le test de F-029 qui le couvre.
const APPELANTS_DU_RANG: Readonly<Record<string, string>> = {
  [FACADE]: "packages/document/test/borne-ecriture.test.ts",
  [FORMAT]: "packages/document/test/borne-ecriture.test.ts",
  "packages/document/test/borne-calcul.test.ts": "packages/document/test/borne-calcul.test.ts",
  "packages/document/test/rang.test.ts": "packages/document/test/borne-contrat.test.ts",
  // F-017 : la façade de table place par `insertionParmi`, le format de table lit et admet les rangs.
  [FACADE_TABLE]: TEST_DU_RANG_DE_TABLE,
  [FORMAT_TABLE]: TEST_DU_RANG_DE_TABLE,
  [TEST_DU_RANG_DE_TABLE]: TEST_DU_RANG_DE_TABLE,
};
const ECRIVAINS_DE_PLACE: Readonly<Record<string, string>> = {
  [FACADE]: "packages/document/test/borne-ecriture.test.ts",
  [FORMAT]: "packages/document/test/borne-ecriture.test.ts",
  "packages/document/test/borne-ecriture.test.ts": "packages/document/test/borne-ecriture.test.ts",
};
const LECTEURS_DES_TYPES_RACINES: Readonly<Record<string, string>> = {
  [FORMAT]: "packages/document/test/borne-lecture.test.ts",
  // F-012 : lecture de la clé de version et publication des versions admises (F-012-AC29).
  "apps/server/src/synchro-stockage.ts": "apps/server/test/synchro-document.test.ts",
  "packages/contrats/src/synchro.ts": "apps/server/test/synchro-document.test.ts",
};
const DISTINGUENT_UN_CODE: Readonly<Record<string, string>> = {
  "apps/web/src/espace/garde-version.ts": CE_FICHIER,
  "apps/web/src/interface/Application.tsx": CE_FICHIER,
  "apps/web/src/interface/messages.ts": CE_FICHIER,
  "apps/web/src/page/session-page.ts": CE_FICHIER,
};
const OUVRANTS_A_BORNE: Readonly<Record<string, string>> = {
  [FACADE]: "packages/document/test/borne-contrat.test.ts",
  "packages/document/test/borne-ecriture.test.ts": "packages/document/test/borne-ecriture.test.ts",
  "packages/document/test/borne-lecture.test.ts": "packages/document/test/borne-lecture.test.ts",
};

// Un module est couvert si le test inscrit cite F-029 et le fait entrer, ou le nomme par son chemin.
function couvert(module: string, test: string): boolean {
  const texte = fichiers.get(test);
  if (texte === undefined || !/F-029-AC\d+/.test(texte)) {
    return false;
  }
  const nom = module.slice(module.lastIndexOf("/") + 1);
  return (
    test === module ||
    declarationsDe(test, texte).some(({ vise }) => vise === module) ||
    texte.includes(module) ||
    texte.includes(nom)
  );
}

const ESSAI = "apps/web/src/essai.ts";

describe("énumérations de F-029 sur des cas fautifs", () => {
  it.each<[string, (textes: Textes) => string[], string]>([
    [
      "un nouvel appelant du rang",
      appelantsDuRang,
      'import { rangEntre } from "../../../packages/document/src/rang.ts";\n',
    ],
    [
      "un nouvel écrivain de place",
      ecrivainsDePlace,
      'import { ecrirePlace } from "./format.ts";\n',
    ],
    [
      "une nouvelle définition d'écriture",
      ecrivainsDePlace,
      `export ${FONCTION} admettrePlace() {}\n`,
    ],
    [
      "un nouveau lecteur de types racines",
      lecteursDesTypesRacines,
      `doc.getMap("${NOMS_DU_FORMAT.pages}");\n`,
    ],
    [
      "un nom de type racine cité",
      lecteursDesTypesRacines,
      `const TYPE = '${NOMS_DU_FORMAT.meta}';\n`,
    ],
    [
      "un nouveau module qui distingue un code",
      distinguentUnCode,
      "if (erreur instanceof ErreurDocument) {}\n",
    ],
    [
      "un nouvel ouvrant à borne",
      ouvrantsABorne,
      'import { ouvrirDocumentEspaceBorne } from "./x.ts";\n',
    ],
  ])("F-029-AC16 l'énumération voit %s", (_cas, enumerer, texte) => {
    expect(enumerer([[ESSAI, texte]])).toEqual([ESSAI]);
  });

  it.each<[string, (textes: Textes) => string[], string]>([
    ["un autre module que le rang", appelantsDuRang, 'import { a } from "./arbre.ts";\n'],
    ["un nom d'écriture en commentaire seul", ecrivainsDePlace, "// ecrirePlace écrit la place\n"],
    [
      "un test qui lit les types racines",
      lecteursDesTypesRacines,
      `doc.getMap("${NOMS_DU_FORMAT.pages}");\n`,
    ],
    ["une autre erreur à code", distinguentUnCode, "if (erreur.code === 'x') {}\n"],
  ])("F-029-AC16 l'énumération écarte %s", (_cas, enumerer, texte) => {
    const chemin = enumerer === lecteursDesTypesRacines ? `${ICI}/essai.test.ts` : ESSAI;

    expect(enumerer([[chemin, texte]])).toEqual([]);
  });

  it("F-029-AC16 un module inscrit sans test de F-029 qui le couvre est vu", () => {
    expect(couvert(FACADE, "packages/document/test/operations.test.ts")).toBe(false);
    expect(couvert(FACADE, "packages/document/test/inexistant.test.ts")).toBe(false);
    expect(couvert(FACADE, "packages/document/test/borne-ecriture.test.ts")).toBe(true);
  });
});

describe("coutures du rang borné dans le workspace", () => {
  it.each<[string, (textes: Textes) => string[], Readonly<Record<string, string>>]>([
    ["(a) appelants du calcul et du contrôle d'un rang", appelantsDuRang, APPELANTS_DU_RANG],
    ["(b) points d'écriture de place et leurs appelants", ecrivainsDePlace, ECRIVAINS_DE_PLACE],
    [
      "(c) lecteurs des types racines meta et pages",
      lecteursDesTypesRacines,
      LECTEURS_DES_TYPES_RACINES,
    ],
    [
      "(d) modules qui distinguent un code d'ErreurDocument",
      distinguentUnCode,
      DISTINGUENT_UN_CODE,
    ],
    ["entrée interne à borne abaissée", ouvrantsABorne, OUVRANTS_A_BORNE],
  ])(
    "F-029-AC16 %s : liste fermée, chacun couvert par un test de F-029",
    (_cas, enumerer, inscrits) => {
      expect(enumerer(fichiers)).toEqual(Object.keys(inscrits).sort());
      for (const [module, test] of Object.entries(inscrits)) {
        expect(couvert(module, test), `${module} par ${test}`).toBe(true);
      }
    },
  );

  it("F-029-AC16 l'énumération lit bien le workspace, code et tests des deux côtés", () => {
    expect([...fichiers.keys()]).toEqual(
      expect.arrayContaining([
        RANG,
        FORMAT,
        FACADE,
        "packages/document/test/rang.test.ts",
        CE_FICHIER,
      ]),
    );
  });

  it("F-029-AC16 les appelants du rang l'appellent là où la conception le dit", () => {
    const facade = texteDe(FACADE);
    const format = texteDe(FORMAT);

    // F-017 : le calcul d'insertion est extrait dans rang.ts (`insertionParmi`), commun aux façades.
    expect(facade).toMatch(/function insertionALaPosition\([^]*?\binsertionParmi\(/);
    expect(texteDe(RANG)).toMatch(/function insertionParmi\([^]*?\brangEntre\(/);
    expect(texteDe(RANG)).toMatch(/function insertionElargie\([^]*?\brangsRepartis\(/);
    expect(texteDe(FACADE_TABLE)).toMatch(/function placement\([^]*?\binsertionParmi\(/);
    expect(texteDe(FORMAT_TABLE)).toMatch(/function estUnRangAdmis\([^]*?\bestUnRang\(/);
    expect(texteDe(FORMAT_TABLE)).toMatch(/function admettreRang\([^]*?\bestUnRang\(/);
    expect(format).toMatch(/function lirePlace\([^]*?\bestUnRang\(rang, longueurMaxRang\)/);
    expect(format).toMatch(
      new RegExp(
        `${FONCTION} admettrePlace\\([^]*?\\bestUnRang\\(place\\.rang, longueurMaxRang\\)`,
      ),
    );
    expect(texteDe(RANG)).not.toMatch(/\bimport\b/);
  });

  it("F-029-AC16 les modules qui distinguent un code traitent rang-indisponible : traduit par messages.ts, transmis par Application.tsx, laissé aux autres par les deux gardes de version", () => {
    expect(messageErreur("rang-indisponible")).toBe(
      "Impossible de placer la page à cet endroit : l'action n'a pas été effectuée.",
    );
    expect(texteDe("apps/web/src/interface/Application.tsx")).toMatch(
      /erreur instanceof ErreurDocument\)\s*\{\s*return \{ refus: erreur\.code \}/,
    );
    for (const garde of [
      "apps/web/src/espace/garde-version.ts",
      "apps/web/src/page/session-page.ts",
    ]) {
      const codes = [...texteDe(garde).matchAll(/erreur\.code === "([^"]+)"/g)].map(
        ([, code]) => code,
      );
      expect(codes, garde).toEqual(["version-non-prise-en-charge"]);
    }
    const code: CodeErreurDocument = "rang-indisponible";
    expect(new ErreurDocument(code, "x").code).toBe(code);
  });
});
