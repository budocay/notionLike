// Garanties de F-003 après l'ajout du bloc code et du menu slash (F-005-AC33) : aucune requête
// réseau, une seule instance de yjs, les paquets d'édition confinés au module d'édition, une seule
// version de @floating-ui/dom, prosemirror-view à 1.42.3 au moins. Chaque contrôle statique a ses
// cas fautifs, donnés comme données.
import { describe, expect, it } from "vitest";

import { lire } from "./aides-disque.ts";
import { type Aretes, graphe } from "./aides-graphe.ts";
import {
  couperLeReseau,
  entrerDansLEditeur,
  laisserLeMenuSuivre,
  monterLEditeur,
  presser,
  taper,
} from "./edition/aides-edition.tsx";

const VERSION_DE_TIPTAP = "3.31.4";

/** Versions d'un paquet que ce verrou résout, sans doublon. */
function versionsResolues(verrou: string, paquet: string): string[] {
  const motif = new RegExp(
    String.raw`^ {2}'?${paquet.replace("/", "\\/")}@(\d+\.\d+\.\d+)'?:$`,
    "gm",
  );
  return [...new Set([...verrou.matchAll(motif)].map(([, version = ""]) => version))];
}

/** Chaque paquet `@tiptap/*` du verrou résolu hors du numéro commun, liaison Yjs exceptée. */
function tiptapHorsDuNumeroCommun(verrou: string): string[] {
  const entrees = verrou.matchAll(/^ {2}'(@tiptap\/[\w-]+)@(\d+\.\d+\.\d+)':$/gm);
  return [...entrees]
    .filter(([, paquet]) => paquet !== "@tiptap/y-tiptap")
    .filter(([, , version]) => version !== VERSION_DE_TIPTAP)
    .map(([, paquet, version]) => `${String(paquet)}@${String(version)}`);
}

function auMoins(version: string, minimum: string): boolean {
  const [a, b] = [version, minimum].map((texte) => texte.split(".").map(Number));
  for (let rang = 0; rang < 3; rang += 1) {
    const ecart = (a?.[rang] ?? 0) - (b?.[rang] ?? 0);
    if (ecart !== 0) {
      return ecart > 0;
    }
  }
  return true;
}

/** Fautes du verrou au regard de F-005-AC33 et de F-003-AC26, AC30. */
function fautesDuVerrou(verrou: string): string[] {
  const fautes: string[] = [];
  const floating = versionsResolues(verrou, "@floating-ui/dom");
  if (floating.length !== 1) {
    fautes.push(`@floating-ui/dom : ${floating.length} versions`);
  }
  const yjs = versionsResolues(verrou, "yjs");
  if (yjs.length !== 1) {
    fautes.push(`yjs : ${yjs.length} versions`);
  }
  const vues = versionsResolues(verrou, "prosemirror-view");
  if (vues.length === 0 || !vues.every((version) => auMoins(version, "1.42.3"))) {
    fautes.push(`prosemirror-view : ${vues.join(", ")}`);
  }
  fautes.push(
    ...tiptapHorsDuNumeroCommun(verrou).map((entree) => `hors numéro commun : ${entree}`),
  );
  return fautes;
}

const SUGGESTION_ET_POSITIONNEMENT =
  /(^|\/)node_modules\/(@tiptap\/suggestion|@floating-ui\/[^/]+)\//;

/** Modules qui importent l'utilitaire de suggestion ou la bibliothèque de positionnement. */
function importateursConfines(aretes: Aretes): string[] {
  return [...aretes]
    .filter(([, dependances]) => dependances.some((une) => SUGGESTION_ET_POSITIONNEMENT.test(une)))
    .map(([module]) => module)
    .sort();
}

describe("garanties de F-003 après le bloc code et le menu slash", () => {
  it("F-005-AC33 F-003-AC21 un bloc code, son langage et le menu slash, réseau coupé : aucune requête", async () => {
    const appels = couperLeReseau();
    monterLEditeur();
    entrerDansLEditeur();

    taper("/");
    await laisserLeMenuSuivre();
    taper("cod");
    await laisserLeMenuSuivre();
    presser("Enter");
    await laisserLeMenuSuivre();
    taper("print(1)");
    presser("Escape");

    expect(appels).toEqual([]);
  });

  it("F-005-AC33 F-003-AC26 F-003-AC30 le verrou ne résout qu'une version de @floating-ui/dom et de yjs, prosemirror-view à 1.42.3 au moins, et tout @tiptap/* au numéro commun ; le manifeste déclare les trois paquets en version exacte", () => {
    const manifeste = JSON.parse(lire("package.json")) as { dependencies: Record<string, string> };

    expect(fautesDuVerrou(lire("../../pnpm-lock.yaml"))).toEqual([]);
    expect(manifeste.dependencies["@tiptap/extension-code-block"]).toBe(VERSION_DE_TIPTAP);
    expect(manifeste.dependencies["@tiptap/suggestion"]).toBe(VERSION_DE_TIPTAP);
    expect(manifeste.dependencies["@floating-ui/dom"]).toBe("1.8.0");
    expect(Object.keys(manifeste.dependencies)).not.toContain("@tiptap/starter-kit");
  });

  it("F-005-AC33 cas fautifs du contrôle du verrou : deux @floating-ui/dom, deux yjs, un prosemirror-view trop ancien et un @tiptap/* hors du numéro commun sont vus", () => {
    const verrou = [
      "  '@floating-ui/dom@1.8.0':",
      "  '@floating-ui/dom@1.7.4':",
      "  yjs@13.6.33:",
      "  yjs@13.6.10:",
      "  prosemirror-view@1.42.2:",
      "  '@tiptap/suggestion@3.32.0':",
      "  '@tiptap/y-tiptap@3.0.9':",
    ].join("\n");

    expect(fautesDuVerrou(verrou)).toEqual([
      "@floating-ui/dom : 2 versions",
      "yjs : 2 versions",
      "prosemirror-view : 1.42.2",
      "hors numéro commun : @tiptap/suggestion@3.32.0",
    ]);
  });

  it("F-005-AC33 F-003-AC27 l'utilitaire de suggestion et @floating-ui/* ne sont importés que par le menu slash du module d'édition, et la règle de contrats les interdit partout ailleurs", async () => {
    const aretes = await graphe();
    const regles = lire("../../.dependency-cruiser.cjs");

    expect(importateursConfines(aretes)).toEqual(["src/edition/menu-slash.ts"]);
    expect(regles).toMatch(
      /name: "suggestion-et-positionnement-confines"[^]*?from: \{ pathNot: "\^apps\/web\/src\/edition\/" \}[^]*?@tiptap\/suggestion\|@floating-ui/,
    );
  }, 60_000);

  it("F-005-AC33 cas fautifs du confinement : un composant, une aide de test et un paquet qui importent l'utilitaire ou la bibliothèque sont nommés", () => {
    const aretes: Aretes = new Map([
      ["src/edition/menu-slash.ts", ["../../node_modules/@tiptap/suggestion/dist/index.js"]],
      ["src/interface/Menu.tsx", ["node_modules/@floating-ui/dom/dist/index.mjs"]],
      ["test/edition/aides.tsx", ["node_modules/.pnpm/x/node_modules/@tiptap/suggestion/a.js"]],
      ["src/autre.ts", ["node_modules/@tiptap/core/index.js"]],
    ]);

    expect(importateursConfines(aretes)).toEqual([
      "src/edition/menu-slash.ts",
      "src/interface/Menu.tsx",
      "test/edition/aides.tsx",
    ]);
  });
});
