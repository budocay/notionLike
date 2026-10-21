// Contrôles statiques de l'éditeur de page : aucun HTML brut (F-003-AC20), bibliothèque d'édition
// confinée (F-003-AC27), forme des identifiants (F-003-AC36), colonne de lecture (F-003-AC38),
// règles de F-004 tenues par les fichiers de cette feature (F-003-AC44).
import { describe, expect, it } from "vitest";

import { lire, lireDossier } from "./aides-disque.ts";
import { type Aretes, graphe } from "./aides-graphe.ts";
import {
  contexteDe,
  controlerFichier,
  FEUILLE_D_ENTREE,
  FICHIER_DES_JETONS,
} from "./aides-styles.ts";

const sources = lireDossier("src");
const sourcesDuDocument = import.meta.glob<string>("../../../packages/document/src/**/*.ts", {
  query: "?raw",
  import: "default",
  eager: true,
});

const HTML_BRUT = /\b(innerHTML|outerHTML|insertAdjacentHTML|dangerouslySetInnerHTML)\b/;

/** Première injection de HTML brut de ces fichiers, nommée avec son fichier ; `undefined` sinon. */
function premiereInjection(fichiers: ReadonlyMap<string, string>): string | undefined {
  for (const [chemin, texte] of fichiers) {
    const trouvee = HTML_BRUT.exec(texte);
    if (trouvee !== null) {
      return `${chemin} : ${trouvee[1]}`;
    }
  }
  return undefined;
}

describe("aucun HTML brut", () => {
  it("F-003-AC20 F-005-AC10 aucun fichier source d'apps/web n'injecte de HTML brut : l'énumération couvre le module d'édition, fichiers du bloc code et du menu slash compris, et s'arrête à la première occurrence", () => {
    expect(sources.size).toBeGreaterThan(60);
    expect([...sources.keys()].filter((chemin) => chemin.startsWith("src/edition/"))).toEqual([
      "src/edition/EditeurDePage.tsx",
      "src/edition/adresses.ts",
      "src/edition/barre.ts",
      // F-005 : bloc code, liste des langages, filtre et menu slash (F-005-AC10).
      "src/edition/bloc-code.ts",
      // F-033 : bornes d'un bloc colorable et coloration du bloc code (F-033-AC6).
      "src/edition/colorable.ts",
      "src/edition/coloration.ts",
      "src/edition/commandes-de-bloc.ts",
      "src/edition/commandes-de-marque.ts",
      // F-006 : déplacement d'un bloc, lâcher et raccourcis, poignée du curseur.
      "src/edition/deplacement-de-bloc.ts",
      "src/edition/depot.ts",
      "src/edition/filtre-des-commandes.ts",
      // F-033 : indentation et sortie au clavier du bloc code.
      "src/edition/indentation.ts",
      "src/edition/index.ts",
      "src/edition/invite.ts",
      "src/edition/langages.ts",
      "src/edition/liaison.ts",
      "src/edition/lien.ts",
      "src/edition/marques.ts",
      "src/edition/menu-slash-affiche.ts",
      "src/edition/menu-slash.ts",
      "src/edition/panneau.ts",
      "src/edition/placement.ts",
      "src/edition/poignee.ts",
      "src/edition/schema.ts",
      "src/edition/selection-du-navigateur.ts",
      "src/edition/types-de-bloc.ts",
    ]);
    expect(premiereInjection(sources)).toBeUndefined();
  });

  it.each([
    ["innerHTML", "element.innerHTML = texte;"],
    ["outerHTML", "const html = element.outerHTML;"],
    ["insertAdjacentHTML", 'element.insertAdjacentHTML("beforeend", texte);'],
    ["dangerouslySetInnerHTML", "<p dangerouslySetInnerHTML={{ __html: texte }} />"],
  ])("F-003-AC20 une occurrence de %s est nommée avec son fichier", (nom, texte) => {
    const fichiers = new Map([
      ["src/a.ts", "export const a = 1;"],
      ["src/b.tsx", texte],
      ["src/c.tsx", "element.innerHTML = autre;"],
    ]);

    expect(premiereInjection(fichiers)).toBe(`src/b.tsx : ${nom}`);
  });
});

const BIBLIOTHEQUE_D_EDITION =
  /(^|\/)node_modules\/(@tiptap|prosemirror-[^/]+|y-prosemirror|y-protocols)\//;
const MODULE_D_EDITION = /^(src|test)\/edition\//;
const INTERFACE_DE_L_EDITION = "src/edition/index.ts";

/** Modules qui importent la bibliothèque d'édition hors du module d'édition et de ses aides. */
function importateursHorsDuModule(aretes: Aretes): string[] {
  return [...aretes]
    .filter(
      ([module, dependances]) =>
        !MODULE_D_EDITION.test(module) &&
        dependances.some((dependance) => BIBLIOTHEQUE_D_EDITION.test(dependance)),
    )
    .map(([module]) => module)
    .sort();
}

/** Imports d'un fichier du module d'édition autre que son interface, depuis le dehors. */
function entreesDetournees(aretes: Aretes): string[] {
  return [...aretes].flatMap(([module, dependances]) =>
    module.startsWith("src/edition/")
      ? []
      : dependances
          .filter(
            (dependance) =>
              dependance.startsWith("src/edition/") && dependance !== INTERFACE_DE_L_EDITION,
          )
          .map((dependance) => `${module} → ${dependance}`),
  );
}

describe("confinement de la bibliothèque d'édition", () => {
  it("F-003-AC27 Tiptap, ProseMirror et leur liaison Yjs ne sont importés que par le module d'édition et l'aide de ses tests, et le reste de l'application n'atteint le module que par son interface", async () => {
    const aretes = await graphe();
    const importateurs = [...aretes]
      .filter(([, dependances]) => dependances.some((un) => BIBLIOTHEQUE_D_EDITION.test(un)))
      .map(([module]) => module)
      .sort();

    expect(importateursHorsDuModule(aretes)).toEqual([]);
    expect(importateurs).toEqual([
      "src/edition/EditeurDePage.tsx",
      "src/edition/barre.ts",
      // F-005 : bloc code et menu slash (F-005-AC33).
      "src/edition/bloc-code.ts",
      // F-033 : greffon de coloration du bloc code.
      "src/edition/coloration.ts",
      "src/edition/commandes-de-marque.ts",
      // F-006 : poignée de bloc, curseur de dépôt, déplacement d'un bloc (F-006-AC32).
      "src/edition/deplacement-de-bloc.ts",
      "src/edition/depot.ts",
      // F-033 : indentation du bloc code.
      "src/edition/indentation.ts",
      "src/edition/invite.ts",
      "src/edition/liaison.ts",
      "src/edition/lien.ts",
      "src/edition/marques.ts",
      "src/edition/menu-slash-affiche.ts",
      "src/edition/menu-slash.ts",
      "src/edition/panneau.ts",
      "src/edition/poignee.ts",
      "src/edition/schema.ts",
      "src/edition/selection-du-navigateur.ts",
      "src/edition/types-de-bloc.ts",
      "test/edition/aides-edition.tsx",
    ]);
    expect(entreesDetournees(aretes)).toEqual([]);
  }, 60_000);

  it("F-003-AC27 l'interface du module n'expose aucun type de la bibliothèque : elle rend le composant et ses propriétés, faites de types de yjs, de React et du DOM", () => {
    const interfaceDuModule = lire(INTERFACE_DE_L_EDITION);
    const composant = lire("src/edition/EditeurDePage.tsx");
    const proprietes = /export interface ProprietesEditeurDePage \{[^]*?\n\}/.exec(composant)?.[0];

    expect(interfaceDuModule.match(/export \{[^}]*\}/g)).toEqual([
      // F-028 : la règle des adresses, fonction pure (F-028-AC11).
      "export { adresseAcceptee, adresseDUneSaisie }",
      "export { EditeurDePage, type ProprietesEditeurDePage }",
      // F-005 : la liste des commandes de bloc et son filtre, donnée et fonction pures.
      "export { commandesFiltrees }",
      "export { LISTE_DES_COMMANDES }",
    ]);
    expect(interfaceDuModule).not.toMatch(/@tiptap|prosemirror/);
    expect(proprietes).toBeDefined();
    expect(proprietes).not.toMatch(/\bEditor\b|Extension|Node\b|Plugin/);
    expect(proprietes).toMatch(/Y\.XmlFragment/);
  });

  it("F-003-AC27 packages/document n'importe aucune bibliothèque d'édition", () => {
    const textes = Object.entries(sourcesDuDocument);

    expect(textes.map(([chemin]) => chemin.split("/").at(-1)).sort()).toEqual(
      expect.arrayContaining(["document-page.ts", "format-page.ts"]),
    );
    expect(
      textes.filter(([, texte]) => /@tiptap|prosemirror|y-protocols/.test(texte)).map(([c]) => c),
    ).toEqual([]);
  });

  it("F-003-AC27 un import de la bibliothèque hors du module, et un fichier du module importé sans passer par son interface, sont nommés", () => {
    const essai: Aretes = new Map([
      ["src/edition/schema.ts", ["../../node_modules/.pnpm/x/node_modules/@tiptap/core/index.js"]],
      ["test/edition/aides-edition.tsx", ["node_modules/@tiptap/core/index.js"]],
      [
        "src/interface/A.tsx",
        ["node_modules/prosemirror-view/dist/index.js", "src/edition/barre.ts"],
      ],
      ["src/page/b.ts", ["node_modules/y-protocols/awareness.js", INTERFACE_DE_L_EDITION]],
      ["test/c.test.tsx", ["node_modules/@tiptap/pm/state/index.js"]],
      ["src/d.ts", ["node_modules/react/index.js"]],
    ]);

    expect(importateursHorsDuModule(essai)).toEqual([
      "src/interface/A.tsx",
      "src/page/b.ts",
      "test/c.test.tsx",
    ]);
    expect(entreesDetournees(essai)).toEqual(["src/interface/A.tsx → src/edition/barre.ts"]);
  });
});

const FORME_D_UUID = /\{8\}-|\{12\}|\buuid\b.*=\s*\//i;
const DEFINITION_DE_LA_FORME = "src/identifiants/uuid-canonique.ts";
const PREFIXE_DES_BASES = "notionlike:";
const FICHIERS_QUI_NOMMENT_UNE_BASE = [
  "src/persistance/espace-local.ts",
  "src/persistance/nom-de-base.ts",
  // F-018-AC40 : la clé des réglages de vue d'une table, assemblée par ce seul fichier.
  "src/persistance/reglages-de-vue.ts",
];

function fautesDIdentifiants(fichiers: ReadonlyMap<string, string>): string[] {
  return [...fichiers].flatMap(([chemin, texte]) => [
    ...(chemin !== DEFINITION_DE_LA_FORME && FORME_D_UUID.test(texte)
      ? [`${chemin} : seconde définition de la forme d'un identifiant`]
      : []),
    ...(!FICHIERS_QUI_NOMMENT_UNE_BASE.includes(chemin) && texte.includes(PREFIXE_DES_BASES)
      ? [`${chemin} : nom de base assemblé hors du module de persistance`]
      : []),
  ]);
}

describe("forme des identifiants d'un document de page", () => {
  it("F-003-AC36 aucun fichier source d'apps/web autre que celui d'identifiants/ ne porte une expression régulière d'UUID, et aucun autre que ceux de F-002 ne porte le préfixe des bases", () => {
    expect(fautesDIdentifiants(sources)).toEqual([]);
    expect(FORME_D_UUID.test(lire(DEFINITION_DE_LA_FORME))).toBe(true);
    for (const chemin of FICHIERS_QUI_NOMMENT_UNE_BASE) {
      expect(lire(chemin), chemin).toContain(PREFIXE_DES_BASES);
    }
    expect([...sources.keys()]).toEqual(
      expect.arrayContaining(["src/page/pages-ouvertes.ts", "src/page/session-page.ts"]),
    );
  });

  it("F-003-AC36 une seconde définition de la forme, ou un nom de base assemblé ailleurs, est nommé avec son fichier", () => {
    const fichiers = new Map([
      [DEFINITION_DE_LA_FORME, "const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}/;"],
      ["src/persistance/nom-de-base.ts", "return `notionlike:page:${idEspace}`;"],
      ["src/page/session-page.ts", "const FORME = /^[0-9a-f]{8}-/;"],
      ["src/page/pages-ouvertes.ts", "const nom = `notionlike:page:${idEspace}:${idPage}`;"],
      ["src/edition/schema.ts", "export const a = 1;"],
    ]);

    expect(fautesDIdentifiants(fichiers)).toEqual([
      "src/page/session-page.ts : seconde définition de la forme d'un identifiant",
      "src/page/pages-ouvertes.ts : nom de base assemblé hors du module de persistance",
    ]);
  });
});

const JETON_DE_LA_COLONNE = "--container-lecture";
const CLASSE_DE_LA_COLONNE = "max-w-lecture";

/** Fautes d'une colonne de lecture : jeton absent ou d'une autre valeur, classe qui ne le consomme pas. */
function fautesDeColonne(jetons: string, classes: Readonly<Record<string, string>>): string[] {
  const valeur = new RegExp(`${JETON_DE_LA_COLONNE}:\\s*([^;]+);`).exec(jetons)?.[1];
  return [
    ...(valeur === "44rem" ? [] : [`jeton ${JETON_DE_LA_COLONNE} : ${valeur ?? "absent"}`]),
    ...Object.entries(classes)
      .filter(([, liste]) => !liste.split(/\s+/).includes(CLASSE_DE_LA_COLONNE))
      .map(([nom]) => `${nom} ne consomme pas ${CLASSE_DE_LA_COLONNE}`),
    ...Object.entries(classes)
      .filter(([, liste]) => !liste.split(/\s+/).includes("mx-auto"))
      .map(([nom]) => `${nom} n'est pas centrée`),
  ];
}

function classeDe(fichier: string, cle: string): string {
  return new RegExp(`\\b${cle}:\\s*"([^"]*)"`).exec(lire(fichier))?.[1] ?? "";
}

describe("colonne de lecture", () => {
  it("F-003-AC38 le jeton de largeur de la colonne existe, à 44 rem, et le titre comme le corps de la page le consomment, centrés, avec une marge latérale en jeton d'espacement", () => {
    const colonnes = {
      "titre de la page": classeDe("src/interface/composants/etats.classes.ts", "contenu"),
      "corps de la page": classeDe("src/interface/composants/edition.classes.ts", "colonne"),
    };
    const marges = [
      classeDe("src/interface/composants/etats.classes.ts", "zone"),
      classeDe("src/interface/composants/edition.classes.ts", "corps"),
    ];

    expect(fautesDeColonne(lire(FICHIER_DES_JETONS), colonnes)).toEqual([]);
    for (const marge of marges) {
      expect(marge.split(/\s+/)).toEqual(expect.arrayContaining(["px-normal", "etroit:px-vaste"]));
    }
    expect(
      [...sources].filter(([, texte]) => texte.includes(JETON_DE_LA_COLONNE)).map(([c]) => c),
    ).toEqual([FICHIER_DES_JETONS]);
  });

  it("F-003-AC38 un jeton absent ou d'une autre largeur, une colonne qui ne le consomme pas ou qui n'est pas centrée, sont nommés", () => {
    const conforme = { colonne: "mx-auto flex w-full max-w-lecture flex-col" };

    expect(fautesDeColonne("--container-lecture: 44rem;", conforme)).toEqual([]);
    expect(fautesDeColonne("--container-ecran: 34rem;", conforme)).toEqual([
      "jeton --container-lecture : absent",
    ]);
    expect(fautesDeColonne("--container-lecture: 60rem;", conforme)).toEqual([
      "jeton --container-lecture : 60rem",
    ]);
    expect(
      fautesDeColonne("--container-lecture: 44rem;", { colonne: "mx-auto w-full max-w-ecran" }),
    ).toEqual(["colonne ne consomme pas max-w-lecture"]);
    expect(
      fautesDeColonne("--container-lecture: 44rem;", { colonne: "w-full max-w-lecture" }),
    ).toEqual(["colonne n'est pas centrée"]);
  });
});

const FICHIERS_DE_LA_FEATURE = [...sources.keys()].filter((chemin) =>
  /^src\/(edition|page)\/|^src\/interface\/(composants\/(Edition\.tsx|edition\.classes\.ts)|page-ouverte\.ts|etat-d-enregistrement\.ts)$/.test(
    chemin,
  ),
);

/** Fautes de l'apparition de la barre : classe nommée, durée en jeton, sans attente. */
function fautesDApparition(feuille: string): string[] {
  const regle = /@utility barre-flottante \{[^]*?\n\}/.exec(feuille)?.[0];
  if (regle === undefined) {
    return ["classe nommée barre-flottante absente"];
  }
  const transition = /transition:\s*([^;]+);/.exec(regle)?.[1] ?? "";
  return [
    ...(/^opacity var\(--duree-[\w-]+\) var\(--ease-[\w-]+\)$/.test(transition)
      ? []
      : [`transition hors jeton, ou qui fait attendre : « ${transition} »`]),
    ...(regle.includes("@starting-style") ? [] : ["apparition sans état de départ"]),
  ];
}

describe("coutures avec F-004", () => {
  it("F-003-AC44 les contrôles statiques de F-004 couvrent les fichiers de cette feature et restent verts : jetons seuls, aucune classe en dur, aucun contour supprimé hors de la règle nommée", () => {
    const contexte = contexteDe(lire(FICHIER_DES_JETONS), lire(FEUILLE_D_ENTREE));

    // 13 fichiers à F-003, 19 depuis F-028 (six fichiers du module d'édition, dont la relecture de
    // la sélection du navigateur, F-028-AC30), 22 depuis F-006 (déplacement d'un bloc, lâcher,
    // poignée du curseur), 29 depuis F-005 (bloc code, langages, filtre, menu slash et son
    // affichage, commandes de bloc, origine de la liaison), 32 depuis F-033 (bornes, coloration et
    // indentation du bloc code).
    expect(FICHIERS_DE_LA_FEATURE).toHaveLength(32);
    for (const chemin of [...FICHIERS_DE_LA_FEATURE, FEUILLE_D_ENTREE]) {
      expect(controlerFichier(chemin, lire(chemin), contexte), chemin).toEqual([]);
    }
    expect(
      controlerFichier("src/edition/essai.tsx", 'const k = "outline-none bg-[#fff]";', contexte),
    ).not.toEqual([]);
  });

  it("F-003-AC44 chaque commande de la barre de blocs offre une cible d'au moins 44 pixels sur écran étroit ou sous pointeur imprécis, compacte seulement sous pointeur fin sur écran large", () => {
    for (const cle of ["commande", "commandeActive"]) {
      const classes = classeDe("src/interface/composants/edition.classes.ts", cle).split(/\s+/);

      expect(classes, cle).toEqual(expect.arrayContaining(["min-h-cible", "min-w-cible"]));
      expect(
        classes.filter((classe) => /min-[hw]-/.test(classe) && !/cible$/.test(classe)),
        cle,
      ).toEqual(["etroit:pointer-fine:min-h-rangee", "etroit:pointer-fine:min-w-rangee"]);
    }
    expect(lire(FICHIER_DES_JETONS)).toMatch(/--spacing-cible:\s*2\.75rem;/);
  });

  it("F-003-AC44 l'apparition de la barre est une classe nommée, à durée en jeton, nulle sous mouvement réduit, sans attente avant une commande", () => {
    const jetons = lire(FICHIER_DES_JETONS);
    const reduit = /@media \(prefers-reduced-motion: reduce\) \{[^]*?\n\}/.exec(jetons)?.[0] ?? "";

    expect(fautesDApparition(lire(FEUILLE_D_ENTREE))).toEqual([]);
    expect(reduit).toMatch(/--duree-rapide:\s*0ms;/);
    expect(classeDe("src/interface/composants/edition.classes.ts", "barre").split(/\s+/)).toContain(
      "barre-flottante",
    );
  });

  it("F-003-AC44 une apparition absente, à durée littérale, retardée ou sans état de départ est nommée", () => {
    const regle = (transition: string, depart = "@starting-style { opacity: 0; }"): string =>
      `@utility barre-flottante {\n  transition: ${transition};\n  ${depart}\n}`;

    expect(fautesDApparition(regle("opacity var(--duree-rapide) var(--ease-sortie)"))).toEqual([]);
    expect(fautesDApparition("@utility autre {\n}")).toEqual([
      "classe nommée barre-flottante absente",
    ]);
    expect(fautesDApparition(regle("opacity 120ms ease-out"))).toHaveLength(1);
    expect(
      fautesDApparition(regle("opacity var(--duree-rapide) var(--ease-sortie) var(--duree-lente)")),
    ).toHaveLength(1);
    expect(fautesDApparition(regle("opacity var(--duree-rapide) var(--ease-sortie)", ""))).toEqual([
      "apparition sans état de départ",
    ]);
  });
});
