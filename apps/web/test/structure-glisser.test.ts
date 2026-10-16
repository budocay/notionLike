// Structure et coutures de F-006 (F-006-AC30, AC32, AC33) : appelants de `deplacerPage`,
// confinement de la bibliothèque de glisser-déposer et de la poignée de bloc, verrou des
// dépendances. Chaque contrôle reçoit ses données et rend ses fautes ; son cas fautif est éprouvé à
// côté de lui, comme une donnée.
import { describe, expect, it } from "vitest";

import verrou from "../../../pnpm-lock.yaml?raw";
import { lire, lireDossier } from "./aides-disque.ts";
import { type Aretes, atteintsDepuis, graphe } from "./aides-graphe.ts";

const sources = lireDossier("src");

// ——— F-006-AC30 : appelants de deplacerPage ———

const APPEL_DE_DEPLACER_PAGE = /\.deplacerPage\(/;

/** Modules de `src/` qui appellent `deplacerPage`. */
function appelantsDeDeplacerPage(fichiers: ReadonlyMap<string, string>): string[] {
  return [...fichiers]
    .filter(([chemin, texte]) => chemin.startsWith("src/") && APPEL_DE_DEPLACER_PAGE.test(texte))
    .map(([chemin]) => chemin)
    .sort();
}

/** Les appelants qu'aucun des tests donnés n'atteint par ses imports. */
function appelantsNonCouverts(
  aretes: Aretes,
  appelants: readonly string[],
  tests: readonly string[],
): string[] {
  const atteints = new Set(tests.flatMap((test) => [...atteintsDepuis(aretes, test)]));
  return appelants.filter((appelant) => !atteints.has(appelant));
}

const TESTS_DU_DEPLACEMENT = ["test/deplacement-de-page.test.tsx"];

describe("couture de deplacerPage", () => {
  it("F-006-AC30 un seul module d'apps/web appelle deplacerPage, l'action de la barre, et le test du déplacement l'atteint ; F-007 ne l'appelle pas", async () => {
    const aretes = await graphe();
    const appelants = appelantsDeDeplacerPage(sources);

    expect(appelants).toEqual(["src/interface/Application.tsx"]);
    expect(appelantsNonCouverts(aretes, appelants, TESTS_DU_DEPLACEMENT)).toEqual([]);
    expect(lire("src/interface/EcranDeLaCorbeille.tsx")).not.toMatch(APPEL_DE_DEPLACER_PAGE);
  }, 60_000);

  it("F-006-AC30 un second appelant, ou un appelant qu'aucun test n'atteint, est nommé", () => {
    const fichiers = new Map([
      ["src/interface/Application.tsx", "essayer(() => moyens.operations.deplacerPage(id, ou));"],
      ["src/interface/Autre.tsx", "facade.deplacerPage(id, { parent: null });"],
      ["src/espace/session.ts", "deplacerPage: facade.deplacerPage,"],
      ["test/a.test.ts", "espace.deplacerPage(id, ou);"],
    ]);
    const aretes: Aretes = new Map([
      ["test/deplacement-de-page.test.tsx", ["src/interface/Application.tsx"]],
      ["src/interface/Application.tsx", []],
    ]);

    const appelants = appelantsDeDeplacerPage(fichiers);
    expect(appelants).toEqual(["src/interface/Application.tsx", "src/interface/Autre.tsx"]);
    expect(appelantsNonCouverts(aretes, appelants, TESTS_DU_DEPLACEMENT)).toEqual([
      "src/interface/Autre.tsx",
    ]);
  });
});

// ——— F-006-AC32 : confinement ———

const DND_KIT = /(^|\/)node_modules\/@dnd-kit\//;
const MODULE_DE_GLISSER = /^src\/glisser\//;
const POIGNEE_ET_CURSEUR =
  /(^|\/)node_modules\/@tiptap\/(extension-drag-handle|extension-drag-handle-react|extension-node-range|extensions)\//;
const FLOATING_UI = /(^|\/)node_modules\/@floating-ui\//;
const ANIMATION =
  /(^|\/)node_modules\/(motion|framer-motion|@react-spring\/[^/]+|react-spring|gsap|animejs|@formkit\/auto-animate)\//;
const MODULE_D_EDITION = /^(src|test)\/edition\//;

/** Modules qui importent une dépendance de ce motif hors des modules admis. */
function importateursHorsDe(aretes: Aretes, dependance: RegExp, admis: RegExp | null): string[] {
  return [...aretes]
    .filter(
      ([module, dependances]) =>
        (admis === null || !admis.test(module)) && dependances.some((une) => dependance.test(une)),
    )
    .map(([module]) => module)
    .sort();
}

// Ce que l'interface du module de glisser-déposer laisse sortir : des noms de React, du DOM et des
// chaînes, aucun type de la bibliothèque.
const TYPES_DE_LA_BIBLIOTHEQUE =
  /@dnd-kit|\b(UniqueIdentifier|Active|Over|DragEndEvent|DragMoveEvent|DragStartEvent|SensorDescriptor|Transform|SyntheticListenerMap|DraggableAttributes|Announcements|CollisionDetection)\b/;

/** Fautes de l'interface du module : un type de la bibliothèque dans ce qu'il exporte. */
function fautesDeLInterface(fichiers: ReadonlyMap<string, string>): string[] {
  return [...fichiers].flatMap(([chemin, texte]) => {
    const exportes = [...texte.matchAll(/^export (?:interface|type|function)[^]*?^\}/gm)].map(
      ([bloc]) => bloc,
    );
    const reexportes = /index\.ts$/.test(chemin) ? [texte] : [];
    return [...exportes, ...reexportes]
      .filter((bloc) => TYPES_DE_LA_BIBLIOTHEQUE.test(bloc.replace(/\/\/.*$|\/\*[^]*?\*\//gm, "")))
      .map((bloc) => `${chemin} : ${TYPES_DE_LA_BIBLIOTHEQUE.exec(bloc)?.[0] ?? ""}`);
  });
}

function fichiersDuModule(): Map<string, string> {
  return new Map([...sources].filter(([chemin]) => MODULE_DE_GLISSER.test(chemin)));
}

describe("confinement de la bibliothèque de glisser-déposer et de la poignée", () => {
  it("F-006-AC32 dnd-kit n'est importé que par src/glisser/, dont l'interface n'expose aucun type ; la poignée et le curseur de dépôt ne le sont que par le module d'édition ; @floating-ui/dom et aucune bibliothèque d'animation ne le sont nulle part", async () => {
    const aretes = await graphe();

    expect(importateursHorsDe(aretes, DND_KIT, MODULE_DE_GLISSER)).toEqual([]);
    expect(importateursHorsDe(aretes, DND_KIT, null)).toEqual([
      "src/glisser/ListeGlissable.tsx",
      "src/glisser/element.ts",
    ]);
    expect(importateursHorsDe(aretes, POIGNEE_ET_CURSEUR, MODULE_D_EDITION)).toEqual([]);
    expect(importateursHorsDe(aretes, POIGNEE_ET_CURSEUR, null)).toEqual([
      "src/edition/EditeurDePage.tsx",
      "src/edition/schema.ts",
      "test/edition/aides-edition.tsx",
    ]);
    expect(importateursHorsDe(aretes, FLOATING_UI, null)).toEqual([]);
    expect(importateursHorsDe(aretes, ANIMATION, null)).toEqual([]);
    expect([...fichiersDuModule().keys()]).toEqual([
      "src/glisser/ListeGlissable.tsx",
      "src/glisser/element.ts",
      "src/glisser/index.ts",
      "src/glisser/survol.ts",
      "src/glisser/zone.ts",
    ]);
    expect(fautesDeLInterface(fichiersDuModule())).toEqual([]);
    expect(
      [...aretes]
        .filter(([module]) => !MODULE_DE_GLISSER.test(module))
        .flatMap(([module, dependances]) =>
          dependances
            .filter((une) => MODULE_DE_GLISSER.test(une) && une !== "src/glisser/index.ts")
            .map((une) => `${module} → ${une}`),
        ),
    ).toEqual([]);
  }, 60_000);

  it("F-006-AC32 un importateur de dnd-kit, de la poignée, de @floating-ui/dom ou d'une bibliothèque d'animation hors de sa place, et un type de la bibliothèque exporté, sont nommés", () => {
    const aretes: Aretes = new Map([
      [
        "src/glisser/element.ts",
        ["../../node_modules/.pnpm/x/node_modules/@dnd-kit/sortable/a.js"],
      ],
      ["src/interface/A.tsx", ["node_modules/@dnd-kit/core/dist/index.js"]],
      ["test/b.test.tsx", ["node_modules/@dnd-kit/utilities/dist/index.js"]],
      ["src/interface/C.tsx", ["node_modules/@tiptap/extension-drag-handle-react/dist/index.js"]],
      ["src/edition/schema.ts", ["node_modules/@tiptap/extensions/dist/index.js"]],
      ["src/edition/D.ts", ["node_modules/@floating-ui/dom/dist/index.js"]],
      ["src/interface/E.tsx", ["node_modules/framer-motion/dist/index.js"]],
    ]);

    expect(importateursHorsDe(aretes, DND_KIT, MODULE_DE_GLISSER)).toEqual([
      "src/interface/A.tsx",
      "test/b.test.tsx",
    ]);
    expect(importateursHorsDe(aretes, POIGNEE_ET_CURSEUR, MODULE_D_EDITION)).toEqual([
      "src/interface/C.tsx",
    ]);
    expect(importateursHorsDe(aretes, FLOATING_UI, null)).toEqual(["src/edition/D.ts"]);
    expect(importateursHorsDe(aretes, ANIMATION, null)).toEqual(["src/interface/E.tsx"]);
    expect(
      fautesDeLInterface(
        new Map([
          ["src/glisser/index.ts", 'export type { UniqueIdentifier } from "@dnd-kit/core";'],
          [
            "src/glisser/element.ts",
            "export interface ElementGlissable {\n  readonly transform: Transform | null;\n}",
          ],
          [
            "src/glisser/zone.ts",
            '// Pas de type Active ici.\nexport type ZoneDeDepot = "avant" | "apres" | "dans";',
          ],
        ]),
      ),
    ).toEqual(["src/glisser/index.ts : UniqueIdentifier", "src/glisser/element.ts : Transform"]);
  });
});

// ——— F-006-AC33 : verrou ———

/** Versions d'un paquet que ce texte de verrou résout, sans doublon. */
function versionsDansLeVerrou(texte: string, paquet: string): string[] {
  const entrees = texte.matchAll(new RegExp(`^ {2}'?${paquet}@([^(:']+)`, "gm"));
  return [...new Set([...entrees].flatMap((entree) => entree[1] ?? []))];
}

/** Fautes du verrou pour F-006 : versions multiples, Tiptap hors du numéro commun, nouvelle famille. */
function fautesDuVerrou(texte: string): string[] {
  const uniques = ["yjs", "@floating-ui/dom", "prosemirror-view", "tslib"].flatMap((paquet) => {
    const versions = versionsDansLeVerrou(texte, paquet);
    return versions.length === 1 ? [] : [`${paquet} : ${versions.length} versions`];
  });
  const tiptap = [...texte.matchAll(/^ {2}'?(@tiptap\/[a-z0-9-]+)@([^(:']+)/gm)]
    .filter(([, nom, version]) => nom !== "@tiptap/y-tiptap" && version !== "3.31.4")
    .map(([, nom, version]) => `${nom ?? ""}@${version ?? ""} : hors du numéro commun 3.31.4`);
  const nouvelleFamille = [
    ...texte.matchAll(
      /^ {2}'?(@dnd-kit\/(?:react|dom|abstract|state|collision|geometry|helpers))@/gm,
    ),
  ].map(([, nom]) => `${nom ?? ""} : nouvelle famille de dnd-kit`);
  return [...uniques, ...new Set(tiptap), ...new Set(nouvelleFamille)];
}

describe("verrou des dépendances", () => {
  it("F-006-AC33 le verrou ne résout qu'une version de yjs, de @floating-ui/dom, de prosemirror-view et de tslib, tous les paquets Tiptap au numéro commun, et aucun paquet de la nouvelle famille de dnd-kit", () => {
    expect(fautesDuVerrou(verrou)).toEqual([]);
    expect(versionsDansLeVerrou(verrou, "@dnd-kit/core")).toEqual(["6.3.1"]);
    expect(versionsDansLeVerrou(verrou, "@floating-ui/dom")).toEqual(["1.8.0"]);
    expect(versionsDansLeVerrou(verrou, "@tiptap/extension-drag-handle")).toEqual(["3.31.4"]);
  });

  it("F-006-AC33 une seconde version, un paquet Tiptap à un autre numéro et la nouvelle famille de dnd-kit sont nommés", () => {
    const fautif = [
      "  yjs@13.6.33:",
      "  yjs@13.6.34:",
      "  '@floating-ui/dom@1.8.0':",
      "  prosemirror-view@1.42.6:",
      "  tslib@2.8.1:",
      "  '@tiptap/core@3.32.0':",
      "  '@tiptap/y-tiptap@3.0.9':",
      "  '@dnd-kit/react@0.5.1':",
    ].join("\n");

    expect(fautesDuVerrou(fautif)).toEqual([
      "yjs : 2 versions",
      "@tiptap/core@3.32.0 : hors du numéro commun 3.31.4",
      "@dnd-kit/react : nouvelle famille de dnd-kit",
    ]);
  });
});
