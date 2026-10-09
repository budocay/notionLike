// Contrôles statiques des fichiers de style. Chaque contrôle passe sur les fichiers réels, lus sur
// le disque, et détecte un cas fautif donné comme donnée de test (F-004-AC21, AC53).
import { describe, expect, it } from "vitest";

import { existe, lire, lister } from "./aides-disque.ts";
import {
  contexteDe,
  controlerBase,
  controlerClasses,
  controlerCouleurDeTheme,
  controlerFichier,
  controlerSources,
  fauteDeClasse,
  FEUILLE_D_ENTREE,
  FICHIER_DES_JETONS,
  fichiersAnalyses,
  sourcesDe,
} from "./aides-styles.ts";

const jetons = lire(FICHIER_DES_JETONS);
const entree = lire(FEUILLE_D_ENTREE);
const contexte = contexteDe(jetons, entree);

// Aucune exemption : la feuille de F-002, exception nommée du bloc 1, est supprimée par
// l'habillage de l'application.
const FEUILLE_DE_F002 = "src/styles.css";

const GABARITS = ["index.html", "demo.html"];
const disque = [...GABARITS, ...lister("src")];
const controles = disque;
const analyses = fichiersAnalyses(entree, disque);

function fautesDe(chemin: string, texte: string): string[] {
  return controlerFichier(chemin, texte, contexte);
}

function classe(nom: string): string | undefined {
  return fauteDeClasse(nom, contexte);
}

describe("fichiers de style réels", () => {
  it("F-004-AC3 F-004-AC16 chaque fichier source d'apps/web passe les interdits, sans aucune exemption", () => {
    expect(controles.length).toBeGreaterThan(30);
    for (const chemin of controles) {
      const attendues = chemin === FICHIER_DES_JETONS ? "sans objet" : [];
      const fautes = chemin === FICHIER_DES_JETONS ? "sans objet" : fautesDe(chemin, lire(chemin));
      expect(fautes, chemin).toEqual(attendues);
    }
  });

  it("F-004-AC3 F-004-AC16 la feuille de F-002 est supprimée : la seule feuille que l'entrée importe est la feuille d'entrée, seule à importer Tailwind et les jetons", () => {
    expect(existe(FEUILLE_DE_F002)).toBe(false);
    expect(disque.filter((chemin) => chemin.endsWith(".css"))).toEqual([
      FEUILLE_D_ENTREE,
      FICHIER_DES_JETONS,
    ]);
    expect(lire("src/main.tsx").match(/^import "[^"]*\.css";$/gm)).toEqual([
      'import "./styles/entree.css";',
    ]);
    const quiImportentUneFeuille = disque.filter(
      (chemin) => /\.tsx?$/.test(chemin) && /import "[^"]*\.css"/.test(lire(chemin)),
    );
    expect(quiImportentUneFeuille).toEqual(["src/demonstration/entree.tsx", "src/main.tsx"]);
  });

  it("F-004-AC3 F-004-AC19 chaque classe d'un fichier analysé par Tailwind est nommée ou bâtie sur un jeton", () => {
    expect(analyses.length).toBeGreaterThanOrEqual(10);
    for (const chemin of analyses) {
      expect(controlerClasses(chemin, lire(chemin), contexte), chemin).toEqual([]);
    }
  });

  it("F-004-AC23 l'analyse de Tailwind est bornée aux fichiers de classes et au gabarit de démonstration", () => {
    expect(controlerSources(entree, disque, controles)).toEqual([]);
    expect(sourcesDe(entree)).toEqual([
      "src/interface/composants/*.classes.ts",
      "src/demonstration/*.classes.ts",
      "demo.html",
    ]);
    expect(analyses.every((chemin) => /\.classes\.ts$|^demo\.html$/.test(chemin))).toBe(true);
  });

  it("F-004-AC3 hors des fichiers analysés, aucun composant n'écrit une classe en dur", () => {
    const composants = controles.filter((chemin) => /^src\/.*\.tsx$/.test(chemin));
    expect(composants.length).toBeGreaterThanOrEqual(18);
    for (const chemin of composants) {
      expect(lire(chemin), chemin).not.toMatch(/className=["'`]|className=\{["'`]/);
    }
  });

  it("F-004-AC6 F-004-AC10 thème sombre sur la racine, contour de focus global au jeton", () => {
    expect(controlerBase(entree, jetons)).toEqual([]);
  });

  it("F-004-AC6 la couleur de thème de chaque gabarit est celle du fond de l'application", () => {
    for (const gabarit of GABARITS) {
      expect(controlerCouleurDeTheme(gabarit, lire(gabarit), jetons)).toEqual([]);
    }
  });

  it("F-004-AC47 le dégradé d'accent n'est consommé qu'aux emplacements de la liste fermée", () => {
    const consommateurs = controles.filter(
      (chemin) =>
        chemin !== FICHIER_DES_JETONS && /--degrade-accent|fond-accent/.test(lire(chemin)),
    );
    expect(consommateurs).toEqual([
      "src/interface/composants/barre.classes.ts",
      "src/interface/composants/rangee.classes.ts",
      "src/styles/entree.css",
    ]);
    expect(lire("src/interface/composants/barre.classes.ts").match(/fond-accent/g)).toHaveLength(1);
    expect(lire("src/interface/composants/rangee.classes.ts").match(/fond-accent/g)).toHaveLength(
      1,
    );
    expect(entree.match(/--degrade-accent/g)).toHaveLength(1);
  });

  it("F-004-AC48 le halo est une classe nommée, immobile, qui ne reçoit aucun pointeur", () => {
    expect(entree).toMatch(/@utility fond-halo \{\s*background-image: var\(--degrade-halo\);\s*\}/);
    const etats = lire("src/interface/composants/etats.classes.ts");
    expect(etats).toMatch(/halo: "fond-halo pointer-events-none absolute /);
  });

  it("F-004-AC40 aucun fichier source ne porte de texte affirmatif d'enregistrement", () => {
    for (const chemin of disque) {
      expect(lire(chemin), chemin).not.toMatch(
        /Enregistré sur cet appareil|Modifications enregistrées/,
      );
    }
    // Le seul texte d'enregistrement est celui de l'échec, écrit une fois, dans les messages.
    const quiLEcrivent = disque.filter((chemin) =>
      lire(chemin).includes("Non enregistré sur cet appareil"),
    );
    expect(quiLEcrivent).toEqual(["src/interface/messages.ts"]);
  });
});

describe("interdits : cas conformes et cas fautifs", () => {
  const CONFORME = `export const A = "flex";\nconst x = { style: "var(--color-surface-application)" };`;

  it("F-004-AC21 F-004-AC3 un fichier conforme passe, une extension inconnue est refusée", () => {
    expect(fautesDe("src/a.ts", CONFORME)).toEqual([]);
    expect(fautesDe("src/a.svg", "<svg />")).toEqual([
      "src/a.svg : extension « svg » que le contrôle ne sait pas analyser",
    ]);
  });

  it.each([
    ['const c = "#fff";', "couleur littérale : « #fff »"],
    ['const c = "rgb(0 0 0)";', "couleur littérale : « rgb( »"],
    ['<path fill="red" />', 'couleur littérale : « "red" »'],
    ['const d = "150ms";', "durée littérale : « 150ms »"],
    ['const e = "cubic-bezier(0, 0, 1, 1)";', "courbe littérale : « cubic-bezier( »"],
    [
      'const v = "var(--primitif-encre-900)";',
      "jeton primitif consommé hors du fichier des jetons : « --primitif-encre-900 »",
    ],
    [
      'const k = "bg-(--primitif-encre-900)";',
      "jeton primitif consommé hors du fichier des jetons : « --primitif-encre-900 »",
    ],
    ['const k = "bg-[#fff]";', "valeur arbitraire entre crochets : « bg-[#fff] »"],
    ['const k = "w-[13px]";', "valeur arbitraire entre crochets : « w-[13px] »"],
    ['const k = "duration-[150ms]";', "valeur arbitraire entre crochets : « duration-[150ms] »"],
  ])("F-004-AC21 F-004-AC3 %s est refusé", (texte, faute) => {
    expect(fautesDe("src/a.tsx", texte)).toContain(`src/a.tsx : ${faute}`);
  });

  it.each([
    [
      'const k = "dark:bg-surface-application";',
      "variante dark:, qui suit la préférence du système : « dark: »",
    ],
    ['const k = "md:flex";', "variante d'un seuil par défaut de Tailwind : « md: »"],
    ['const k = "outline-2";', "classe à nombre nu, hors des jetons du projet : « outline-2 »"],
    [
      'const k = "focus-visible:outline-2";',
      "classe à nombre nu, hors des jetons du projet : « outline-2 »",
    ],
    ['const k = "p-4";', "classe à nombre nu, hors des jetons du projet : « p-4 »"],
    ['const k = "mx-auto container";', "classe container : « container »"],
  ])("F-004-AC21 F-004-AC6 F-004-AC19 %s est refusé", (texte, faute) => {
    expect(fautesDe("src/a.tsx", texte)).toContain(`src/a.tsx : ${faute}`);
  });

  it("F-004-AC21 F-004-AC10 un contour de focus supprimé est refusé, en classe comme en CSS", () => {
    expect(fautesDe("src/a.tsx", 'const k = "outline-none";')).toEqual([
      "src/a.tsx : contour de focus supprimé : « outline-none »",
    ]);
    expect(fautesDe("src/a.css", "a:focus-visible { outline: none; }")).toEqual([
      "src/a.css : contour de focus supprimé : « outline: none »",
    ]);
    expect(fautesDe("src/a.css", "a { outline-offset: var(--epaisseur-contour); }")).toEqual([]);
  });

  it("F-004-AC21 F-004-AC18 une adresse externe est refusée", () => {
    expect(fautesDe("src/a.css", '@import url("https://polices.example/a.css");')).toEqual([
      "src/a.css : adresse externe : « https:// »",
    ]);
    expect(fautesDe("demo.html", '<img src="//images.example/a.png" />')).toEqual([
      'demo.html : adresse externe : « src="// »',
    ]);
    expect(fautesDe("demo.html", '<script type="module" src="/src/main.tsx"></script>')).toEqual(
      [],
    );
  });

  it("F-004-AC53 F-004-AC40 un texte affirmatif d'enregistrement est refusé, l'échec reste permis", () => {
    expect(fautesDe("src/a.ts", 'const t = "Enregistré sur cet appareil";')).toEqual([
      "src/a.ts : texte affirmatif d'enregistrement : « Enregistré sur cet appareil »",
    ]);
    expect(
      fautesDe("index.html", "<p>Modifications enregistrées sur cet appareil.</p>"),
    ).toHaveLength(1);
    expect(fautesDe("src/a.ts", 'const t = "Non enregistré sur cet appareil";')).toEqual([]);
    expect(fautesDe("src/a.ts", 'const t = "Vos modifications ne sont pas enregistrées";')).toEqual(
      [],
    );
  });

  it("F-004-AC53 F-004-AC41 une requête de largeur à valeur littérale est refusée", () => {
    expect(fautesDe("src/a.css", "@media (min-width: 820px) { a { display: none; } }")).toEqual([
      "src/a.css : requête de largeur à valeur littérale : « (min-width: 820 »",
    ]);
    expect(fautesDe("src/a.ts", 'matchMedia("(width < 51.25rem)");')).toHaveLength(1);
    expect(fautesDe("src/a.css", ".a { @variant etroit { display: none; } }")).toEqual([]);
  });

  it("F-004-AC21 F-004-AC4 une directive @theme hors du fichier des jetons est refusée", () => {
    expect(fautesDe("src/a.css", "@theme { --radius-grand: 1rem; }")).toContain(
      "src/a.css : directive @theme hors du fichier des jetons : « @theme »",
    );
  });

  it("F-004-AC21 F-004-AC6 la seule couleur littérale d'un gabarit est sa couleur de thème", () => {
    const gabarit = '<meta name="theme-color" content="#10151c" />';
    expect(fautesDe("demo.html", gabarit)).toEqual([]);
    expect(fautesDe("demo.html", `${gabarit}<body style="color: #10151c">`)).toHaveLength(1);
    expect(controlerCouleurDeTheme("demo.html", gabarit, jetons)).toEqual([]);
    expect(
      controlerCouleurDeTheme("demo.html", gabarit.replace("#10151c", "#16171a"), jetons),
    ).toEqual(["demo.html : theme-color « #16171a », le fond de l'application vaut « #10151c »"]);
    expect(controlerCouleurDeTheme("demo.html", "<head></head>", jetons)).toHaveLength(1);
  });
});

describe("feuilles CSS : cas conformes et cas fautifs", () => {
  it("F-004-AC21 F-004-AC3 F-004-AC19 couleur littérale et jeton non déclaré", () => {
    expect(fautesDe("src/a.css", ".a { color: var(--color-texte-principal); }")).toEqual([]);
    expect(fautesDe("src/a.css", ".a { color: white; }")).toEqual([
      "src/a.css : couleur littérale : « color: white »",
    ]);
    expect(fautesDe("src/a.css", ".a { color: var(--color-texte-absent); }")).toEqual([
      "src/a.css : jeton non déclaré : « --color-texte-absent »",
    ]);
  });

  it("F-004-AC21 F-004-AC11 une transition n'anime que transform et opacity, avec une durée en jeton", () => {
    const bonne =
      ".a { transition: opacity var(--duree-rapide) var(--ease-sortie), transform var(--duree-rapide) var(--ease-sortie); }";
    expect(fautesDe("src/a.css", bonne)).toEqual([]);
    expect(fautesDe("src/a.css", ".a { transition: all var(--duree-rapide); }")).toEqual([
      "src/a.css : transition de « all », ni transform ni opacity",
    ]);
    expect(
      fautesDe("src/a.css", ".a { transition: background-color var(--duree-rapide); }"),
    ).toEqual(["src/a.css : transition de « background-color », ni transform ni opacity"]);
    expect(fautesDe("src/a.css", ".a { transition: opacity var(--ease-sortie); }")).toEqual([
      "src/a.css : transition sans durée tirée d'un jeton : « opacity var(--ease-sortie) »",
    ]);
    expect(fautesDe("src/a.css", ".a { transition-property: opacity, width; }")).toEqual([
      "src/a.css : transition de « width », ni transform ni opacity",
    ]);
  });

  it("F-004-AC21 F-004-AC3 F-004-AC12 durée, courbe ou animation littérale", () => {
    expect(fautesDe("src/a.css", ".a { transition: opacity 150ms var(--ease-sortie); }")).toEqual([
      "src/a.css : durée littérale : « transition: opacity 150ms var(--ease-sortie) »",
      "src/a.css : transition sans durée tirée d'un jeton : « opacity 150ms var(--ease-sortie) »",
    ]);
    expect(
      fautesDe("src/a.css", ".a { transition: opacity var(--duree-rapide) ease-in-out; }"),
    ).toEqual([
      "src/a.css : courbe littérale : « transition: opacity var(--duree-rapide) ease-in-out »",
    ]);
    expect(
      fautesDe("src/a.css", ".a { animation: tourne var(--duree-rapide) var(--ease-sortie); }"),
    ).toEqual([
      "src/a.css : animation hors d'un jeton --animate-* : « tourne var(--duree-rapide) var(--ease-sortie) »",
    ]);
  });

  it("F-004-AC21 F-004-AC13 une classe nommée qui boucle s'arrête sous mouvement réduit", () => {
    const arretee =
      "@utility attente { animation: var(--animate-chargement); @media (prefers-reduced-motion: reduce) { animation: none; } }";
    expect(fautesDe("src/a.css", arretee)).toEqual([]);
    expect(
      fautesDe("src/a.css", "@utility attente { animation: var(--animate-chargement); }"),
    ).toEqual([
      "src/a.css : la classe attente boucle sans « animation: none » sous mouvement réduit",
    ]);
    expect(
      fautesDe("src/a.css", "@utility entree { animation: var(--animate-apparition); }"),
    ).toEqual([]);
  });
});

describe("classes des fichiers analysés : cas conformes et cas fautifs", () => {
  it("F-004-AC21 F-004-AC19 une classe bâtie sur un jeton, nommée ou de structure est permise", () => {
    for (const nom of [
      "flex",
      "bg-surface-application",
      "text-texte-principal",
      "text-interface",
      "p-moyen",
      "-mt-mince",
      "max-w-lecture",
      "rounded-tl-petit",
      "font-fort",
      "shadow-menu",
      "fond-accent",
      "etroit:hidden",
      "max-etroit:px-normal",
      "hover:bg-surface-survol",
      "group-hover:text-texte-principal",
      "duration-(--duree-rapide)",
      "ease-sortie",
      "animate-apparition",
    ]) {
      expect(classe(nom), nom).toBeUndefined();
    }
  });

  it.each([
    ["bg-red-500", "classe à nombre nu, hors des jetons du projet"],
    ["p-4", "classe à nombre nu, hors des jetons du projet"],
    ["outline-2", "classe à nombre nu, hors des jetons du projet"],
    ["focus-visible:outline-2", "classe à nombre nu, hors des jetons du projet"],
    ["opacity-0", "classe à nombre nu, hors des jetons du projet"],
    ["flex-1", "classe à nombre nu, hors des jetons du projet"],
    ["z-10", "classe à nombre nu, hors des jetons du projet"],
    ["bg-surface-application/50", "classe à nombre nu, hors des jetons du projet"],
    ["text-lg", "classe qui n'est ni nommée par le projet ni bâtie sur un jeton"],
    ["shadow-md", "classe qui n'est ni nommée par le projet ni bâtie sur un jeton"],
    ["font-bold", "classe qui n'est ni nommée par le projet ni bâtie sur un jeton"],
    ["container", "classe qui n'est ni nommée par le projet ni bâtie sur un jeton"],
    ["border", "classe qui n'est ni nommée par le projet ni bâtie sur un jeton"],
    ["transition-all", "classe qui n'est ni nommée par le projet ni bâtie sur un jeton"],
    ["transition", "classe qui n'est ni nommée par le projet ni bâtie sur un jeton"],
    ["bg-texte-absent", "classe qui n'est ni nommée par le projet ni bâtie sur un jeton"],
    ["text-titre--line-height", "classe qui n'est ni nommée par le projet ni bâtie sur un jeton"],
    ["duration-(--ease-sortie)", "classe qui n'est ni nommée par le projet ni bâtie sur un jeton"],
    [
      "bg-(--color-surface-application)",
      "classe qui n'est ni nommée par le projet ni bâtie sur un jeton",
    ],
    ["md:flex", "variante « md: » hors des variantes du projet"],
    ["dark:flex", "variante « dark: » hors des variantes du projet"],
    ["large:flex", "variante « large: » hors des variantes du projet"],
  ])("F-004-AC21 F-004-AC19 la classe %s est refusée", (nom, faute) => {
    expect(classe(nom)).toBe(faute);
  });

  it("F-004-AC21 F-004-AC3 un fichier de classes n'importe rien et ne compose rien à l'exécution", () => {
    const conforme = 'const BASE = "flex";\nexport const A = `${BASE} p-moyen`;';
    expect(controlerClasses("src/a.classes.ts", conforme, contexte)).toEqual([]);
    expect(controlerClasses("src/a.classes.ts", 'import { x } from "./x.ts";', contexte)).toContain(
      "src/a.classes.ts : un fichier de classes n'importe rien",
    );
    expect(
      controlerClasses("src/a.classes.ts", "export const a = (x: string) => `bg-${x}`;", contexte),
    ).toContain("src/a.classes.ts : classe composée à l'exécution, que Tailwind ne produit pas");
    expect(
      controlerClasses("src/a.classes.ts", 'export const A = "flex text-lg";', contexte),
    ).toEqual([
      "src/a.classes.ts : « text-lg » : classe qui n'est ni nommée par le projet ni bâtie sur un jeton",
    ]);
  });

  it("F-004-AC21 F-004-AC11 une classe de transition demande sa durée au même endroit", () => {
    const bonne = 'export const A = "transition-opacity duration-(--duree-rapide) ease-sortie";';
    expect(controlerClasses("src/a.classes.ts", bonne, contexte)).toEqual([]);
    expect(
      controlerClasses("src/a.classes.ts", 'export const A = "transition-opacity";', contexte),
    ).toEqual([
      "src/a.classes.ts : transition sans durée tirée d'un jeton : « transition-opacity »",
    ]);
  });

  it("F-004-AC21 F-004-AC13 une animation en boucle demande motion-reduce:animate-none à son usage", () => {
    const bonne = 'export const A = "animate-chargement motion-reduce:animate-none";';
    expect(controlerClasses("src/a.classes.ts", bonne, contexte)).toEqual([]);
    expect(
      controlerClasses("src/a.classes.ts", 'export const A = "animate-chargement";', contexte),
    ).toEqual([
      "src/a.classes.ts : animation en boucle sans motion-reduce:animate-none : « animate-chargement »",
    ]);
    expect(
      controlerClasses("src/a.classes.ts", 'export const A = "animate-apparition";', contexte),
    ).toEqual([]);
  });

  it("F-004-AC21 F-004-AC19 les classes d'un gabarit analysé sont contrôlées aussi", () => {
    expect(
      controlerClasses("demo.html", '<body class="bg-surface-application">', contexte),
    ).toEqual([]);
    expect(controlerClasses("demo.html", '<body class="bg-gray-900">', contexte)).toEqual([
      "demo.html : « bg-gray-900 » : classe à nombre nu, hors des jetons du projet",
    ]);
  });
});

describe("feuille d'entrée : cas conformes et cas fautifs", () => {
  const ENTREE =
    '@import "tailwindcss" source(none);\n@source "../demonstration/*.classes.ts";\n@import "./jetons.css";';
  const DISQUE = ["src/demonstration/page.classes.ts", "src/main.tsx"];

  it("F-004-AC21 F-004-AC23 analyse bornée : conforme, puis chaque défaut", () => {
    expect(controlerSources(ENTREE, DISQUE, DISQUE)).toEqual([]);
    expect(controlerSources(ENTREE.replace(" source(none)", ""), DISQUE, DISQUE)).toEqual([
      'src/styles/entree.css : « @import "tailwindcss" source(none); » attendu',
    ]);
    expect(controlerSources(`${ENTREE}\n@source "../../dist";`, DISQUE, DISQUE)).toEqual([
      "src/styles/entree.css : @source hors des sources d'apps/web : « dist »",
    ]);
    expect(
      controlerSources(`${ENTREE}\n@source "../../../../packages/document/src";`, DISQUE, DISQUE),
    ).toHaveLength(1);
    expect(controlerSources(`${ENTREE}\n@source "../absent/*.ts";`, DISQUE, DISQUE)).toEqual([
      "src/styles/entree.css : @source qui ne désigne aucun fichier : « src/absent/*.ts »",
    ]);
    expect(controlerSources(ENTREE, DISQUE, ["src/main.tsx"])).toEqual([
      "src/demonstration/page.classes.ts : analysé par Tailwind sans être contrôlé",
    ]);
    expect(
      controlerSources(ENTREE.replace('@import "./jetons.css";', ""), DISQUE, DISQUE),
    ).toHaveLength(1);
  });

  it("F-004-AC21 F-004-AC6 F-004-AC10 racine sans thème sombre, contour absent, étranger ou trop fin", () => {
    const base =
      ":root { color-scheme: dark; }\n:focus-visible { outline: var(--epaisseur-contour) solid var(--color-repere-focus); }";
    expect(controlerBase(base, jetons)).toEqual([]);
    expect(controlerBase(base.replace("color-scheme: dark;", ""), jetons)).toEqual([
      "src/styles/entree.css : « color-scheme: dark » manque sur :root",
    ]);
    expect(
      controlerBase(base.replace("--color-repere-focus", "--color-surface-filet"), jetons),
    ).toEqual([
      "src/styles/entree.css : règle globale :focus-visible sans contour au jeton --color-repere-focus",
    ]);
    expect(controlerBase(base.replace("--epaisseur-contour", "--epaisseur-filet"), jetons)).toEqual(
      ["--epaisseur-filet : contour de focus de « 1px », moins de 2 pixels"],
    );
  });
});
