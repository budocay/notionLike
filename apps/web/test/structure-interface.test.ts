// Contrôles statiques de la structure de l'interface (F-004-AC17, AC57, AC58) : chacun passe sur
// les fichiers réels, lus sur le disque, et détecte un cas fautif donné comme donnée de test
// (F-004-AC53).
import { createHash } from "node:crypto";

import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

import { lire, lireDossier } from "./aides-disque.ts";

const sources = new Map([...lireDossier("src")].filter(([chemin]) => /\.tsx?$/.test(chemin)));

// ── F-004-AC57 : une seule définition du titre cité ──────────────────────────────────────────────

const DEFINITION = "src/interface/messages.ts";
// Un titre entre guillemets français, interpolé dans une chaîne ou posé dans du JSX.
const TITRE_ENTRE_GUILLEMETS = /«\s*(?:\$\{|\{)([^}]*)\}/gu;

function nomsHorsDefinition(fichiers: ReadonlyMap<string, string>): string[] {
  return [...fichiers].flatMap(([chemin, texte]) =>
    [...texte.matchAll(TITRE_ENTRE_GUILLEMETS)]
      .filter(([, expression = ""]) => chemin !== DEFINITION || !/^titreCite\(/.test(expression))
      .map(
        ([trouve]) =>
          `${chemin} : nom composé autour d'un titre sans passer par titreCite : ${trouve}`,
      ),
  );
}

describe("titre cité : une seule définition", () => {
  it("F-004-AC57 aucun fichier de src/ ne compose un nom autour d'un titre hors de messages.ts, où chaque nom passe par titreCite", () => {
    expect(sources.size).toBeGreaterThan(30);
    expect(nomsHorsDefinition(sources)).toEqual([]);
    const definition = sources.get(DEFINITION) ?? "";
    expect(definition.match(/« \$\{titreCite\(/g)?.length).toBeGreaterThanOrEqual(4);
    expect(definition.match(/export function titreCite\(/g)).toHaveLength(1);
    expect(
      [...sources].filter(([, texte]) => /function titreCite\(/.test(texte)).map(([nom]) => nom),
    ).toEqual([DEFINITION]);
  });

  it("F-004-AC53 F-004-AC57 un nom composé hors de la définition, ou sans titreCite dans la définition, est nommé", () => {
    const conforme = new Map([
      [DEFINITION, "return `Sous-pages de « ${titreCite(titre)} »`;"],
      ["src/interface/A.tsx", "const nom = nomSousPages(titre);"],
    ]);
    expect(nomsHorsDefinition(conforme)).toEqual([]);
    expect(
      nomsHorsDefinition(new Map([["src/interface/A.tsx", "aria-label={`Actions « ${titre} »`}"]])),
    ).toEqual([
      "src/interface/A.tsx : nom composé autour d'un titre sans passer par titreCite : « ${titre}",
    ]);
    expect(
      nomsHorsDefinition(new Map([[DEFINITION, "return `Replier « ${titre.trim()} »`;"]])),
    ).toHaveLength(1);
    expect(
      nomsHorsDefinition(new Map([["src/interface/B.tsx", "<span>Page « {titre} »</span>"]])),
    ).toHaveLength(1);
  });
});

// ── F-004-AC58 : aucune directive de désactivation, règle de longueur ───────────────────────────

const DIRECTIVE = /eslint-(?:disable|enable)(?:-next-line|-line)?\b/;

function directivesDeDesactivation(fichiers: ReadonlyMap<string, string>): string[] {
  return [...fichiers].flatMap(([chemin, texte]) => {
    const trouve = DIRECTIVE.exec(texte);
    return trouve === null ? [] : [`${chemin} : directive ${trouve[0]}`];
  });
}

const PLAFOND = 50;

/** Fautes du bloc de configuration ESLint qui borne la longueur des fonctions d'`apps/web/src`. */
function fautesDeLaRegleDeLongueur(configuration: string): string[] {
  const bloc =
    /\{\s*files:\s*\[\s*"apps\/web\/src\/\*\*"\s*\],\s*rules:\s*\{\s*"max-lines-per-function":\s*\[([^\]]*)\]/.exec(
      configuration,
    )?.[1];
  if (bloc === undefined) {
    return ["eslint.config.mjs : max-lines-per-function manque pour apps/web/src/**"];
  }
  const fautes: string[] = [];
  if (!/^\s*"error"/.test(bloc)) {
    fautes.push("eslint.config.mjs : max-lines-per-function n'est pas une erreur");
  }
  const plafond = Number(/\bmax:\s*(\d+)/.exec(bloc)?.[1] ?? Number.POSITIVE_INFINITY);
  if (plafond > PLAFOND) {
    fautes.push(`eslint.config.mjs : plafond de ${plafond} lignes, au-delà de ${PLAFOND}`);
  }
  if (!/skipBlankLines:\s*true/.test(bloc) || !/skipComments:\s*true/.test(bloc)) {
    fautes.push("eslint.config.mjs : lignes vides et commentaires doivent être hors du compte");
  }
  return fautes;
}

/** Fonctions d'`apps/web/src` que la règle signale, mesurées par ESLint lui-même. */
async function fonctionsTropLongues(): Promise<string[]> {
  const racine = import.meta.dirname.replace(/[\\/]apps[\\/]web[\\/]test$/, "");
  const eslint = new ESLint({
    cwd: racine,
    overrideConfig: {
      rules: {
        "max-lines-per-function": [
          "error",
          { max: PLAFOND, skipBlankLines: true, skipComments: true },
        ],
      },
    },
  });
  const resultats = await eslint.lintFiles(["apps/web/src"]);
  expect(resultats.length).toBeGreaterThan(30);
  return resultats.flatMap(({ filePath, messages }) =>
    messages.map(({ ruleId, line, message }) => `${filePath}:${line} ${ruleId} ${message}`),
  );
}

describe("fonctions bornées", () => {
  it("F-004-AC58 mesurée par ESLint avec la règle max-lines-per-function à 50, lignes vides et commentaires non comptés, aucune fonction de src/ ne dépasse, et rien d'autre n'y est signalé", async () => {
    expect(await fonctionsTropLongues()).toEqual([]);
  }, 30_000);

  it("F-004-AC58 aucun fichier de src/ ne porte de directive eslint-disable, de ligne, de bloc ni de fichier", () => {
    expect(directivesDeDesactivation(sources)).toEqual([]);
  });

  it("F-004-AC53 F-004-AC58 une directive de désactivation est nommée avec son fichier", () => {
    expect(directivesDeDesactivation(new Map([["src/a.ts", "const a = 1; // rien"]]))).toEqual([]);
    for (const directive of [
      "// eslint-disable-next-line max-lines-per-function",
      "/* eslint-disable */",
      "const a = 1; // eslint-disable-line",
    ]) {
      expect(directivesDeDesactivation(new Map([["src/a.ts", directive]])), directive).toEqual([
        expect.stringMatching(/^src\/a\.ts : directive eslint-disable/),
      ]);
    }
  });

  it("F-004-AC53 F-004-AC58 la règle de longueur : un bloc conforme passe ; absente, en avertissement, au-delà de 50 ou comptant les lignes vides, elle est refusée", () => {
    const conforme = `{
    files: ["apps/web/src/**"],
    rules: {
      "max-lines-per-function": [
        "error",
        { max: 50, skipBlankLines: true, skipComments: true },
      ],
    },
  },`;
    expect(fautesDeLaRegleDeLongueur(conforme)).toEqual([]);
    expect(fautesDeLaRegleDeLongueur("export default [];")).toEqual([
      "eslint.config.mjs : max-lines-per-function manque pour apps/web/src/**",
    ]);
    expect(fautesDeLaRegleDeLongueur(conforme.replace('"error"', '"warn"'))).toHaveLength(1);
    expect(fautesDeLaRegleDeLongueur(conforme.replace("max: 50", "max: 60"))).toEqual([
      "eslint.config.mjs : plafond de 60 lignes, au-delà de 50",
    ]);
    expect(fautesDeLaRegleDeLongueur(conforme.replace("skipBlankLines: true, ", ""))).toHaveLength(
      1,
    );
    expect(
      fautesDeLaRegleDeLongueur(conforme.replace("apps/web/src/**", "packages/document/src/**")),
    ).toHaveLength(1);
  });

  it("F-004-AC58 eslint.config.mjs borne les fonctions d'apps/web/src à 50 lignes", () => {
    const configuration = lire("../../eslint.config.mjs");
    expect(configuration).toContain("max-lines-per-function");
    expect(fautesDeLaRegleDeLongueur(configuration)).toEqual([]);
  });
});

// ── F-004-AC17, AC58 : les tests de session et de persistance de F-002 sont intacts ──────────────

const EMPREINTES_DE_F002: Readonly<Record<string, string>> = {
  "test/session-fermeture.test.tsx":
    "6fad8ba320ef520f7ed7fd119d20787831edb128263b878de89740f1622586ef",
  "test/persistance-echecs.test.ts":
    "02427f89a08d64a95d374e02c792a3b9112d5f24a04995708aa2e0da0b016681",
  "test/persistance-ouverture.test.ts":
    "48499fab89c86d1b6b77cb9d217005a986e73c794674d1accf27ff53b454f055",
  "test/persistance-validation.test.ts":
    "b151eaa2ad31bd1432d6981ed91dc093d36aec03e0874cca1360754ebcd6b496",
};

function empreinte(texte: string): string {
  return createHash("sha256").update(texte).digest("hex");
}

describe("tests de F-002 que cette feature ne modifie pas", () => {
  it("F-004-AC17 F-004-AC58 les tests de session et de persistance sont ceux de la tête de F-002, à l'octet près", () => {
    const intouchables = [...lireDossier("test").keys()].filter((chemin) =>
      /^test\/(session-fermeture|persistance-[^/]+)\.test\.tsx?$/.test(chemin),
    );
    expect(intouchables).toEqual(Object.keys(EMPREINTES_DE_F002).sort());
    for (const [chemin, attendue] of Object.entries(EMPREINTES_DE_F002)) {
      expect(empreinte(lire(chemin)), chemin).toBe(attendue);
    }
    expect(empreinte("a")).toBe("ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb");
  });
});
