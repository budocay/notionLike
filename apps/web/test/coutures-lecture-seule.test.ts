// Couture de la lecture seule (F-013-AC25, AC40) : l'interface du module d'édition et des
// composants de la barre et de la corbeille a changé pour la lecture seule. Ce test énumère qui les
// rend ou construit leurs données, et vérifie que chaque appelant de production transmet la
// lecture seule ; les autres (démonstration, aides et tests) gardent le comportement d'avant, la
// nouvelle propriété étant facultative et absente valant « modifiable ».
import { describe, expect, it } from "vitest";

import { lireDossier } from "./aides-disque.ts";

const fichiers = new Map([...lireDossier("src"), ...lireDossier("test")]);
const ICI = "test/coutures-lecture-seule.test.ts";

/** Fichiers JSX qui rendent ce composant. */
function appelantsDuComposant(composant: string): string[] {
  const rendu = new RegExp(`<${composant}[\\s/>]`);
  return [...fichiers]
    .filter(([chemin, texte]) => chemin.endsWith(".tsx") && rendu.test(texte))
    .map(([chemin]) => chemin)
    .sort();
}

/** Fichiers qui nomment ce type, hors celui-ci. */
function lecteursDuType(type: string): string[] {
  const nom = new RegExp(`\\b${type}\\b`);
  return [...fichiers]
    .filter(([chemin, texte]) => chemin !== ICI && /\.tsx?$/.test(chemin) && nom.test(texte))
    .map(([chemin]) => chemin)
    .sort();
}

/** Composant changé → ses appelants, et la propriété que l'appelant de production transmet. */
const COMPOSANTS_CHANGES: Readonly<
  Record<
    string,
    { readonly appelants: readonly string[]; readonly production: Readonly<Record<string, string>> }
  >
> = {
  EditeurDePage: {
    appelants: ["src/interface/ZonePrincipale.tsx", "test/edition/aides-edition.tsx"],
    production: { "src/interface/ZonePrincipale.tsx": "lectureSeule=" },
  },
  ZonePrincipale: {
    appelants: ["src/interface/Application.tsx", "test/aides-session-page.tsx"],
    production: { "src/interface/Application.tsx": "lectureSeule=" },
  },
  EcranDeLaCorbeille: {
    appelants: ["src/interface/Application.tsx"],
    production: { "src/interface/Application.tsx": "lectureSeule=" },
  },
  TeteDeBarre: {
    appelants: [
      "src/demonstration/PageDemonstration.tsx",
      "src/interface/BarreLaterale.tsx",
      "test/composants.test.tsx",
    ],
    production: { "src/interface/BarreLaterale.tsx": "raisonNouvellePage=" },
  },
  MenuActions: {
    appelants: [
      "src/demonstration/PageDemonstration.tsx",
      "src/interface/RangeePage.tsx",
      "test/composants.test.tsx",
    ],
    production: { "src/interface/RangeePage.tsx": "raison," },
  },
  Rangee: {
    appelants: [
      "src/demonstration/PageDemonstration.tsx",
      "src/interface/RangeePage.tsx",
      "test/composants.test.tsx",
      "test/tiroir.test.tsx",
    ],
    production: { "src/interface/RangeePage.tsx": "raison," },
  },
};

/** Types de données changés (une raison facultative) → les fichiers qui les nomment. */
const TYPES_CHANGES: Readonly<Record<string, readonly string[]>> = {
  EntreeDeMenu: ["src/interface/RangeePage.tsx", "src/interface/composants/MenuActions.tsx"],
  BoutonDeRangee: ["src/interface/composants/Rangee.tsx"],
  EcranBarre: [
    "src/interface/Application.tsx",
    "src/interface/BarreLaterale.tsx",
    "src/interface/RangeePage.tsx",
  ],
};

describe("F-013-AC40 couture de la lecture seule", () => {
  it.each(Object.entries(COMPOSANTS_CHANGES))(
    "F-013-AC40 F-013-AC25 « %s » n'est rendu que par les fichiers de la liste, et son appelant de production transmet la lecture seule",
    (composant, { appelants, production }) => {
      expect(appelantsDuComposant(composant)).toEqual([...appelants].sort());
      for (const [chemin, propriete] of Object.entries(production)) {
        expect(fichiers.get(chemin), chemin).toContain(propriete);
      }
    },
  );

  it.each(Object.entries(TYPES_CHANGES))(
    "F-013-AC40 le type « %s » n'est nommé que par les fichiers de la liste",
    (type, lecteurs) => {
      expect(lecteursDuType(type)).toEqual([...lecteurs].sort());
    },
  );

  it("F-013-AC40 la nouvelle propriété de chaque composant changé est facultative : absente, le comportement d'avant est gardé", () => {
    const declarations: readonly [string, RegExp][] = [
      ["src/edition/EditeurDePage.tsx", /readonly lectureSeule\?: boolean \| undefined;/],
      ["src/interface/ZonePrincipale.tsx", /readonly lectureSeule\?: boolean \| undefined;/],
      ["src/interface/EcranDeLaCorbeille.tsx", /readonly lectureSeule\?: string \| undefined;/],
      [
        "src/interface/composants/CadreDeBarre.tsx",
        /readonly raisonNouvellePage\?: string \| undefined;/,
      ],
      ["src/interface/composants/MenuActions.tsx", /readonly raison\?: string \| undefined;/],
      ["src/interface/composants/Rangee.tsx", /readonly raison\?: string \| undefined;/],
    ];
    for (const [chemin, declaration] of declarations) {
      expect(fichiers.get(chemin), chemin).toMatch(declaration);
    }
  });
});

// F-013-AC49 : la garde d'onglet lève la confirmation document par document. Ses appelants de
// production lui donnent le document de leur persistance ; sans document (tests de F-030), elle
// garde le comportement d'avant : rien n'est jamais dit acquitté.
const APPELS_DE_LA_GARDE: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  suivreLOnglet: {
    "src/espace/session-espace.ts": "suivreLOnglet(persistance, doc)",
    "src/page/pages-ouvertes.ts": "suivreLOnglet(persistance, tenue.doc)",
    // F-018 : les tables ouvertes donnent aussi le document de leur persistance.
    "src/table/tables-ouvertes.ts": "suivreLOnglet(persistance, tenue.doc)",
    "test/reprise-coutures.test.tsx": "suivreLOnglet(",
  },
  brancherLAcquittement: {
    "src/interface/synchronisation-ouverte.ts": "estAcquitte: demarree.estAcquitte",
  },
};

describe("F-013-AC49 appelants de la garde d'onglet", () => {
  it.each(Object.entries(APPELS_DE_LA_GARDE))(
    "F-013-AC40 F-013-AC49 « %s » n'est appelée que par les fichiers de la liste, chacun comme elle l'attend",
    (fonction, appels) => {
      const appel = new RegExp(`\\b${fonction}\\(`);
      const appelants = [...fichiers]
        .filter(
          ([chemin, texte]) =>
            chemin !== ICI && chemin !== "src/espace/garde-onglet.ts" && appel.test(texte),
        )
        .map(([chemin]) => chemin)
        .sort();
      expect(appelants).toEqual(Object.keys(appels).sort());
      for (const [chemin, forme] of Object.entries(appels)) {
        expect(fichiers.get(chemin), chemin).toContain(forme);
      }
    },
  );
});
