// Contrôles statiques de la structure de l'interface (F-004-AC17, AC52, AC57, AC58) : chacun passe sur
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

/** ESLint de la racine, la règle de longueur imposée ici : la mesure ne dépend pas de sa configuration. */
function mesureur(): ESLint {
  return new ESLint({
    cwd: import.meta.dirname.replace(/[\\/]apps[\\/]web[\\/]test$/, ""),
    overrideConfig: {
      rules: {
        "max-lines-per-function": [
          "error",
          { max: PLAFOND, skipBlankLines: true, skipComments: true },
        ],
      },
    },
  });
}

function signalements(resultats: readonly ESLint.LintResult[]): string[] {
  return resultats.flatMap(({ filePath, messages }) =>
    messages.map(({ ruleId, line, message }) => `${filePath}:${line} ${ruleId} ${message}`),
  );
}

/** Fonctions d'`apps/web/src` que la règle signale, mesurées par ESLint lui-même. */
async function fonctionsTropLongues(): Promise<string[]> {
  const resultats = await mesureur().lintFiles(["apps/web/src"]);
  expect(resultats.length).toBeGreaterThan(30);
  return signalements(resultats);
}

/** Même mesure, sur un texte donné comme s'il était un fichier d'`apps/web/src`. */
async function mesurer(texte: string): Promise<string[]> {
  return signalements(await mesureur().lintText(texte, { filePath: "apps/web/src/mesure.ts" }));
}

const LIGNES_HORS_DU_CORPS = ["export function somme(): number {", "let", "return", "}"].length;

/** Une fonction de tant de lignes de code, avec une ligne vide et un commentaire en plus. */
function fonctionDe(lignes: number): string {
  const corps = Array.from({ length: lignes - LIGNES_HORS_DU_CORPS }, () => "  total += 1;");
  return [
    "export function somme(): number {",
    "  let total = 0;",
    "",
    "  // Ni cette ligne ni la ligne vide ne comptent.",
    ...corps,
    "  return total;",
    "}",
    "",
  ].join("\n");
}

describe("fonctions bornées", () => {
  it("F-004-AC58 mesurée par ESLint avec la règle max-lines-per-function à 50, lignes vides et commentaires non comptés, aucune fonction de src/ ne dépasse, et rien d'autre n'y est signalé", async () => {
    expect(await fonctionsTropLongues()).toEqual([]);
  }, 30_000);

  it("F-004-AC53 F-004-AC58 la mesure : une fonction de 50 lignes passe, lignes vides et commentaires non comptés ; une fonction de 51 lignes est signalée", async () => {
    expect(await mesurer(fonctionDe(PLAFOND))).toEqual([]);
    expect(await mesurer(fonctionDe(PLAFOND + 1))).toEqual([
      expect.stringMatching(/mesure\.ts:1 max-lines-per-function .*\b51\b/),
    ]);
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

// F-030 retravaille la persistance et met ces empreintes à jour dans le commit même qui change le
// comportement ; chaque test modifié, avec ce qu'il affirmait avant et après, est listé dans
// `MEMORY/features/F-030.md` (F-030-AC19).
const EMPREINTES_DE_F002: Readonly<Record<string, string>> = {
  "test/session-fermeture.test.tsx":
    "6fad8ba320ef520f7ed7fd119d20787831edb128263b878de89740f1622586ef",
  "test/persistance-echecs.test.ts":
    "77d38c6d54cb1d697d8c7f11c3330f75a00d42167cbf41340cc93506b70538c6",
  "test/persistance-ouverture.test.ts":
    "48499fab89c86d1b6b77cb9d217005a986e73c794674d1accf27ff53b454f055",
  "test/persistance-validation.test.ts":
    "f464fbd774aff8369d199b0e7b448f7db72a183783aa748206d42f31387b0b42",
};

function empreinte(texte: string): string {
  return createHash("sha256").update(texte).digest("hex");
}

const INTOUCHABLE = /^test\/(session-fermeture|persistance-[^/]+)\.test\.tsx?$/;

/** Écarts entre les fichiers de test donnés et les empreintes attendues : liste et contenu. */
function ecartsDesIntouchables(
  fichiers: ReadonlyMap<string, string>,
  attendues: Readonly<Record<string, string>>,
): string[] {
  const presents = [...fichiers.keys()].filter((chemin) => INTOUCHABLE.test(chemin));
  return [
    ...presents
      .filter((chemin) => !(chemin in attendues))
      .map((chemin) => `${chemin} : test de session ou de persistance hors de la liste`),
    ...Object.entries(attendues).flatMap(([chemin, attendue]) => {
      const texte = fichiers.get(chemin);
      if (texte === undefined) {
        return [`${chemin} : fichier de la liste absent du disque`];
      }
      return empreinte(texte) === attendue ? [] : [`${chemin} : contenu modifié depuis F-002`];
    }),
  ];
}

describe("tests de F-002 que cette feature ne modifie pas", () => {
  it("F-004-AC17 F-004-AC58 les tests de session et de persistance sont ceux de la tête de F-002, à l'octet près", () => {
    expect(Object.keys(EMPREINTES_DE_F002)).toHaveLength(4);
    expect(ecartsDesIntouchables(lireDossier("test"), EMPREINTES_DE_F002)).toEqual([]);
  });

  it("F-004-AC53 F-004-AC17 un test intouchable modifié d'un octet, retiré, ou un test de persistance ajouté est nommé", () => {
    const attendues = { "test/persistance-a.test.ts": empreinte("contenu de F-002") };
    const conforme = new Map([
      ["test/persistance-a.test.ts", "contenu de F-002"],
      ["test/aides-persistance.ts", "une aide n'est pas un test"],
    ]);
    expect(empreinte("a")).toBe("ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb");
    expect(ecartsDesIntouchables(conforme, attendues)).toEqual([]);
    expect(
      ecartsDesIntouchables(
        new Map([["test/persistance-a.test.ts", "contenu de F-002 "]]),
        attendues,
      ),
    ).toEqual(["test/persistance-a.test.ts : contenu modifié depuis F-002"]);
    expect(ecartsDesIntouchables(new Map(), attendues)).toEqual([
      "test/persistance-a.test.ts : fichier de la liste absent du disque",
    ]);
    expect(
      ecartsDesIntouchables(
        new Map([...conforme, ["test/session-fermeture.test.tsx", "nouveau"]]),
        attendues,
      ),
    ).toEqual([
      "test/session-fermeture.test.tsx : test de session ou de persistance hors de la liste",
    ]);
  });
});

// ── F-004-AC52, AC58 : les outils que les tests importent n'existent qu'en une version ──────────

interface Manifeste {
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly devDependencies?: Readonly<Record<string, string>>;
}

const manifestes = import.meta.glob<Manifeste>(
  ["../../../package.json", "../../*/package.json", "../../../packages/*/package.json"],
  { eager: true, import: "default" },
);

/** Manifestes du workspace qui déclarent le paquet, avec le spécificateur de chacun. */
function declarations(paquet: string): Record<string, string> {
  return Object.fromEntries(
    Object.entries(manifestes).flatMap(([chemin, manifeste]) => {
      const version = manifeste.dependencies?.[paquet] ?? manifeste.devDependencies?.[paquet];
      return version === undefined ? [] : [[chemin, version]];
    }),
  );
}

/** Versions du paquet que le verrou résout, sans doublon. */
function versionsResolues(verrou: string, paquet: string): string[] {
  const entrees = verrou.matchAll(new RegExp(`^ {2}'?${paquet}@([^(:']+)`, "gm"));
  return [...new Set([...entrees].map(([, version = ""]) => version))];
}

// Importés comme bibliothèques par les tests d'apps/web (graphe de F-004-AC52, mesure de
// F-004-AC58) et lancés depuis la racine par `pnpm contrats` et `pnpm lint`.
const OUTILS_PARTAGES = ["dependency-cruiser", "eslint"];

describe("outils partagés avec la racine : une seule version", () => {
  it.each(OUTILS_PARTAGES)(
    "F-004-AC52 F-004-AC58 %s est déclaré par la racine et par apps/web, et le verrou n'en résout qu'une version, celle qu'apps/web fixe : le test et la commande de la racine mesurent avec le même outil",
    (outil) => {
      const declarees = declarations(outil);
      expect(Object.keys(declarees).sort()).toEqual(["../../../package.json", "../package.json"]);
      const fixee = declarees["../package.json"] ?? "";
      expect(fixee).toMatch(/^\d+\.\d+\.\d+$/);
      expect(versionsResolues(lire("../../pnpm-lock.yaml"), outil)).toEqual([fixee]);
    },
  );

  it("F-004-AC53 F-004-AC58 deux versions résolues d'un même outil sont vues, les variantes d'une même version n'en font qu'une", () => {
    const uneSeule =
      "packages:\n\n  eslint@10.11.0:\n    resolution: {}\n\nsnapshots:\n\n  eslint@10.11.0(jiti@2.7.0)(supports-color@7.2.0):\n    dependencies: {}\n\n  eslint-scope@9.1.0:\n";
    expect(versionsResolues(uneSeule, "eslint")).toEqual(["10.11.0"]);
    const deux = `${uneSeule}\n  eslint@10.12.0:\n    resolution: {}\n`;
    expect(versionsResolues(deux, "eslint")).toEqual(["10.11.0", "10.12.0"]);
    expect(versionsResolues("  '@scope/outil@1.0.0':\n", "@scope/outil")).toEqual(["1.0.0"]);
  });
});
