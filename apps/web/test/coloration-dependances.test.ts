// Dépendances de la coloration du bloc code (F-033-AC25, H1, H7) : bibliothèque et grammaires
// importées par le seul `src/edition/coloration.ts`, grammaires une à une et elles seules, aucun lot,
// une seule version de chaque au verrou. La bibliothèque est doublée pour lire les grammaires
// enregistrées : `vi.mock` n'est pas une importation.
import { describe, expect, it, vi } from "vitest";

import verrou from "../../../pnpm-lock.yaml?raw";
import manifeste from "../package.json?raw";
import { lire, lireDossier } from "./aides-disque.ts";

interface Enregistrement {
  registered(langage: string): boolean;
  listLanguages(): string[];
}

const doublure = vi.hoisted(() => ({ instances: [] as unknown[] }));

vi.mock("lowlight", async (importOriginal) => {
  const vraie = await importOriginal<{ createLowlight: (grammaires: unknown) => unknown }>();
  return {
    ...vraie,
    createLowlight: (grammaires: unknown): unknown => {
      const instance = vraie.createLowlight(grammaires);
      doublure.instances.push(instance);
      return instance;
    },
  };
});

const CE_FICHIER = "test/coloration-dependances.test.ts";
const SEUL_IMPORTATEUR = "src/edition/coloration.ts";
const GRAMMAIRES = [
  "bash",
  "css",
  "javascript",
  "json",
  "markdown",
  "python",
  "sql",
  "typescript",
  "xml",
  "yaml",
];

/** Les sources d'apps/web : application, tests et bout en bout, ce fichier excepté. */
function sources(): Map<string, string> {
  const toutes = new Map([...lireDossier("src"), ...lireDossier("test"), ...lireDossier("e2e")]);
  toutes.delete(CE_FICHIER);
  return toutes;
}

// Une importation statique, dynamique ou de types, et le module qu'elle nomme.
const IMPORTATION =
  /(?:\bimport\s*(?:type\s+)?([^;"'`]*?)\s*from\s*|\bimport\s*\(\s*|\bexport\s*[^;"'`]*?\s*from\s*|\bimport\s+)["']([^"']+)["']/g;
const LOTS_DE_HIGHLIGHT =
  /^highlight\.js(?:\/lib\/common|\/es\/common|\/lib\/index|\/es\/index)?(?:\.m?js)?$/;
const LOTS_DE_LOWLIGHT = /^lowlight\/lib\/(?:all|common)(?:\.js)?$/;
const NOMS_DE_LOTS = /(?:^|[\s,{])(?:all|common)(?:\s|,|}|$)|\*\s*as\b/;

/** La première importation d'un lot de grammaires, nommée avec son fichier ; `undefined` sinon. */
function premiereImportationDUnLot(fichiers: ReadonlyMap<string, string>): string | undefined {
  for (const [chemin, texte] of fichiers) {
    for (const [, noms = "", module = ""] of texte.matchAll(IMPORTATION)) {
      const lot =
        LOTS_DE_HIGHLIGHT.test(module) ||
        LOTS_DE_LOWLIGHT.test(module) ||
        (module === "lowlight" && NOMS_DE_LOTS.test(noms));
      if (lot) {
        return `${chemin} : ${module}`;
      }
    }
  }
  return undefined;
}

/** Les fichiers qui importent la bibliothèque de coloration ou une grammaire. */
function importateurs(fichiers: ReadonlyMap<string, string>): string[] {
  return [...fichiers]
    .filter(([, texte]) =>
      [...texte.matchAll(IMPORTATION)].some(([, , module = ""]) =>
        /^(lowlight|highlight\.js|hast)(\/|$)/.test(module),
      ),
    )
    .map(([chemin]) => chemin);
}

/** Les versions qu'un texte de verrou résout pour ce paquet, sans doublon. */
function versionsDansLeVerrou(texte: string, paquet: string): string[] {
  const echappe = paquet.replace(/[.]/g, "\\.");
  const entrees = texte.matchAll(new RegExp(`^ {2}'?${echappe}@([^(:']+)`, "gm"));
  return [...new Set([...entrees].flatMap((entree) => entree[1] ?? []))];
}

describe("bibliothèque de coloration confinée", () => {
  it("F-033-AC25 seul src/edition/coloration.ts importe la bibliothèque de coloration et ses grammaires, ni un autre fichier du module, ni un test", () => {
    expect(importateurs(sources())).toEqual([SEUL_IMPORTATEUR]);
  });

  it("F-033-AC25 aucune source d'apps/web n'importe un lot de grammaires", () => {
    const fichiers = sources();

    expect(fichiers.size).toBeGreaterThan(100);
    expect(premiereImportationDUnLot(fichiers)).toBeUndefined();
  });

  it.each([
    ['import { all } from "lowlight";', "lowlight"],
    ['import { common, createLowlight } from "lowlight";', "lowlight"],
    ['import * as tout from "lowlight";', "lowlight"],
    ['import hljs from "highlight.js";', "highlight.js"],
    ['import type { LanguageFn } from "highlight.js";', "highlight.js"],
    ['import hljs from "highlight.js/lib/common";', "highlight.js/lib/common"],
    ['const hljs = await import("highlight.js");', "highlight.js"],
    ['export { default } from "highlight.js/lib/common";', "highlight.js/lib/common"],
  ])("F-033-AC25 un lot importé par « %s » est nommé avec son fichier", (texte, module) => {
    const fichiers = new Map([
      ["src/a.ts", 'import { createLowlight } from "lowlight";'],
      ["src/b.ts", 'import bash from "highlight.js/lib/languages/bash";'],
      ["src/c.ts", texte],
      ["src/d.ts", 'import { all } from "lowlight";'],
    ]);

    expect(premiereImportationDUnLot(fichiers)).toBe(`src/c.ts : ${module}`);
    expect(importateurs(fichiers)).toEqual(["src/a.ts", "src/b.ts", "src/c.ts", "src/d.ts"]);
  });

  it("F-033-AC25 coloration.ts importe `createLowlight` seul, et les grammaires une à une : celles des dix identifiants de la liste, et elles seules", () => {
    const texte = lire(SEUL_IMPORTATEUR);
    const modules = [...texte.matchAll(IMPORTATION)].map(([, noms = "", module = ""]) => ({
      noms: noms.trim(),
      module,
    }));
    const grammaires = modules
      .filter(({ module }) => module.startsWith("highlight.js/"))
      .map(({ module }) => /^highlight\.js\/lib\/languages\/([a-z]+)$/.exec(module)?.[1]);
    const langages = [...lire("src/edition/langages.ts").matchAll(/^ {2}"([a-z]+)",$/gm)].map(
      ([, id]) => id,
    );

    expect(modules.filter(({ module }) => module === "lowlight")).toEqual([
      { noms: "{ createLowlight }", module: "lowlight" },
    ]);
    expect(grammaires).toEqual(GRAMMAIRES);
    // `html` est servi par la grammaire `xml`, dont il est un alias (H1).
    expect(langages.map((id) => (id === "html" ? "xml" : id)).sort()).toEqual(GRAMMAIRES);
    expect(texte).not.toMatch(/highlightAuto/);
  });

  it("F-033-AC25 F-003-AC21 chaque identifiant de la liste a sa grammaire enregistrée, dès l'importation du module d'édition, et aucune autre", async () => {
    await import("../src/edition/index.ts");
    const [instance] = doublure.instances as Enregistrement[];
    const langages = [...lire("src/edition/langages.ts").matchAll(/^ {2}"([a-z]+)",$/gm)].map(
      ([, id = ""]) => id,
    );

    expect(doublure.instances).toHaveLength(1);
    expect(langages).toHaveLength(10);
    for (const langage of langages) {
      expect(instance?.registered(langage), langage).toBe(true);
    }
    expect(instance?.listLanguages().sort()).toEqual(GRAMMAIRES);
  });
});

describe("manifeste et verrou", () => {
  it("F-033-AC25 F-003-AC26 F-003-AC30 apps/web dépend de lowlight 3.3.0 et de highlight.js 11.11.2 en versions exactes, le verrou résout une seule version de chacune, de yjs aussi, et aucune extension Tiptap de coloration", () => {
    const { dependencies = {} } = JSON.parse(manifeste) as {
      dependencies?: Record<string, string>;
    };

    expect(dependencies.lowlight).toBe("3.3.0");
    expect(dependencies["highlight.js"]).toBe("11.11.2");
    expect(versionsDansLeVerrou(verrou, "lowlight")).toEqual(["3.3.0"]);
    expect(versionsDansLeVerrou(verrou, "highlight.js")).toEqual(["11.11.2"]);
    expect(versionsDansLeVerrou(verrou, "yjs")).toHaveLength(1);
    expect(verrou).not.toContain("extension-code-block-lowlight");
  });

  it("F-033-AC25 le contrôle du verrou voit deux versions d'un même paquet", () => {
    const texte = "  highlight.js@11.11.1:\n  highlight.js@11.11.2:\n  'lowlight@3.3.0(x@1)':\n";

    expect(versionsDansLeVerrou(texte, "highlight.js")).toEqual(["11.11.1", "11.11.2"]);
    expect(versionsDansLeVerrou(texte, "lowlight")).toEqual(["3.3.0"]);
  });
});
