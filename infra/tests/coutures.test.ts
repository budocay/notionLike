// Couture de 8f1aedc : `Dictionnaire`, `dictionnaire` et `liste` sont sortis de regles/compose.ts
// pour regles/retention.ts. Les fichiers d'infra/ sont lus comme du texte et chaque entrée de l'un
// de ces trois noms est énumérée ici. Un importeur de plus fait échouer ce test : il se déclare,
// avec le test qui l'exerce (retention.ts est exercé par retention.test.ts, F-008-AC20).
import { readdirSync, readFileSync } from "node:fs";
import { posix } from "node:path";

import { describe, expect, it } from "vitest";

const INFRA = new URL("../", import.meta.url);
const MODULE = "tests/regles/compose";
const NOMS_SORTIS = ["Dictionnaire", "dictionnaire", "liste"];
const SOURCE = /\.[cm]?[jt]s$/;

type Entrees = Readonly<Record<string, readonly string[]>>;

const ATTENDU: Entrees = {
  "tests/regles/retention.ts": ["Dictionnaire", "dictionnaire", "liste"],
};

// Le chemin, relatif à infra/ et sans extension, du module qu'un importeur désigne.
function cible(importeur: string, specificateur: string): string {
  return posix.join(posix.dirname(importeur), specificateur).replace(SOURCE, "");
}

// Les noms sortis qu'un texte fait entrer de regles/compose.ts (`type` et alias retirés), triés ;
// une entrée qui n'est pas une liste de noms (espace de noms, défaut, import dynamique) est rendue
// telle quelle, puisqu'elle donne accès aux trois noms sans les citer.
function nomsImportes(chemin: string, texte: string): string[] {
  const declaration = /(?:import|export)\s+(?:type\s+)?([^;]*?)\s+from\s+"([^"]+)"/g;
  const dynamique = /import\s*\(\s*"([^"]+)"\s*\)/g;
  const declares = [...texte.matchAll(declaration)]
    .filter(([, , specificateur = ""]) => cible(chemin, specificateur) === MODULE)
    .flatMap(([, liste = "", specificateur = ""]) =>
      /^\{[^}]*\}$/.test(liste)
        ? liste
            .slice(1, -1)
            .split(",")
            .map(
              (nom) =>
                nom
                  .trim()
                  .replace(/^type\s+/, "")
                  .split(/\s+as\s+/)[0] ?? "",
            )
            .filter((nom) => NOMS_SORTIS.includes(nom))
        : [`${liste} depuis ${specificateur}`],
    );
  const dynamiques = [...texte.matchAll(dynamique)]
    .filter(([, specificateur = ""]) => cible(chemin, specificateur) === MODULE)
    .map(([entree]) => entree);
  return [...declares, ...dynamiques].sort();
}

function entreesDe(fichiers: ReadonlyMap<string, string>): Entrees {
  const entrees = [...fichiers].map(([chemin, texte]) => [chemin, nomsImportes(chemin, texte)]);
  return Object.fromEntries(entrees.filter(([, noms]) => noms.length > 0));
}

const sources = new Map(
  readdirSync(INFRA, { recursive: true, encoding: "utf8" })
    .filter((chemin) => SOURCE.test(chemin))
    .map((chemin) => [chemin, readFileSync(new URL(chemin, INFRA), "utf8")] as const),
);

describe("importeurs des aides sorties de regles/compose.ts", () => {
  it("F-008-AC20 les fichiers d'infra/ qui importent Dictionnaire, dictionnaire ou liste sont énumérés", () => {
    expect(entreesDe(sources)).toEqual(ATTENDU);
  });

  it("F-008-AC20 un importeur non inscrit, ou une entrée détournée, est vu", () => {
    const voisin = "./compose.ts";
    const depuisLesTests = "./regles/compose.ts";
    const fautifs = new Map([
      [
        "tests/regles/retention.ts",
        `import { type Dictionnaire, dictionnaire, liste } from "${voisin}";`,
      ],
      ["tests/regles/nouvelle.ts", `import { liste } from "${voisin}";`],
      [
        "tests/alias.test.ts",
        `import { dictionnaire as d, lireCompose } from "${depuisLesTests}";`,
      ],
      ["tests/regles/relais.ts", `export { type Dictionnaire } from "${voisin}";`],
      ["tests/espace.test.ts", `import * as compose from "${depuisLesTests}";`],
      ["tests/regles/dynamique.ts", `const compose = await import("${voisin}");`],
      ["tests/sans-les-noms.test.ts", `import { lireCompose } from "${depuisLesTests}";`],
      ["tests/autre-module.test.ts", `import { liste } from "./regles/retention.ts";`],
    ]);

    const entrees = entreesDe(fautifs);

    expect(entrees).toEqual({
      "tests/regles/retention.ts": ["Dictionnaire", "dictionnaire", "liste"],
      "tests/regles/nouvelle.ts": ["liste"],
      "tests/alias.test.ts": ["dictionnaire"],
      "tests/regles/relais.ts": ["Dictionnaire"],
      "tests/espace.test.ts": [`* as compose depuis ${depuisLesTests}`],
      "tests/regles/dynamique.ts": [`import("${voisin}")`],
    });
    expect(entrees).not.toEqual(ATTENDU);
  });
});
