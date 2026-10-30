// Contrôles statiques des fichiers de style. Chaque contrôle passe sur les fichiers réels, lus sur
// le disque, et détecte un cas fautif donné comme donnée de test (F-004-AC21, AC53).
import { describe, expect, it } from "vitest";

import { existe, lire, lister, listerLaRacine } from "./aides-disque.ts";
import {
  classesDeLaSeuleDemonstration,
  classesPortees,
  contexteDe,
  controlerBase,
  controlerClasses,
  controlerClassesEnDur,
  controlerConsommateursDeLAccent,
  controlerCouleurDeTheme,
  controlerFeuilleDeDemonstration,
  controlerFeuilles,
  controlerFichier,
  controlerHalo,
  controlerSeulAuteur,
  controlerSeulLecteur,
  controlerSources,
  EMPLACEMENTS_DE_L_ACCENT,
  ENTREE_DE_LA_DEMONSTRATION,
  fauteDeClasse,
  FEUILLE_D_ENTREE,
  FEUILLE_DE_DEMONSTRATION,
  FICHIER_DES_JETONS,
  fichiersAnalyses,
  sourcesDe,
} from "./aides-styles.ts";

const jetons = lire(FICHIER_DES_JETONS);
const entree = lire(FEUILLE_D_ENTREE);
const demonstration = lire(FEUILLE_DE_DEMONSTRATION);
// L'application ne connaît que les classes nommées de la feuille d'entrée ; la page de
// démonstration, celles des deux feuilles.
const contexte = contexteDe(jetons, entree);
const contexteDeLaPage = contexteDe(jetons, `${entree}\n${demonstration}`);

// Aucune exemption : la feuille de F-002, exception nommée du bloc 1, est supprimée par
// l'habillage de l'application.
const FEUILLE_DE_F002 = "src/styles.css";

// Gabarits et feuilles sont énumérés depuis le disque : un troisième gabarit ou une feuille posée
// hors de src/ n'échappe ni aux interdits ni au compte des feuilles.
const racine = listerLaRacine();
const GABARITS = racine.filter((nom) => nom.endsWith(".html"));
const HORS_DE_SRC = [...racine, ...lister("test"), ...lister("e2e")];
const disque = [...GABARITS, ...lister("src")];
const controles = disque;
const analyses = fichiersAnalyses(entree, disque);
const analysesDeLaPage = fichiersAnalyses(demonstration, disque, FEUILLE_DE_DEMONSTRATION);
const textes = new Map(disque.map((chemin) => [chemin, lire(chemin)]));

function fautesDe(chemin: string, texte: string): string[] {
  return controlerFichier(chemin, texte, contexte);
}

function classe(nom: string): string | undefined {
  return fauteDeClasse(nom, contexte);
}

const MESSAGES = "src/interface/messages.ts";
const ECRAN_D_ENREGISTREMENT = "src/interface/Enregistrement.tsx";

describe("fichiers de style réels", () => {
  it("F-004-AC3 F-004-AC16 chaque fichier source d'apps/web passe les interdits, sans aucune exemption", () => {
    expect(controles.length).toBeGreaterThan(30);
    // Le fichier des jetons a ses propres contrôles (jetons.test.ts) : lui seul déclare des valeurs.
    const consommateurs = controles.filter((chemin) => chemin !== FICHIER_DES_JETONS);
    expect(consommateurs).toHaveLength(controles.length - 1);
    for (const chemin of consommateurs) {
      expect(fautesDe(chemin, lire(chemin)), chemin).toEqual([]);
    }
  });

  it("F-004-AC3 F-004-AC16 F-004-AC23 la feuille de F-002 est supprimée : apps/web n'a que trois feuilles, l'entrée de production importe la feuille d'entrée, seule à importer Tailwind et les jetons, et l'entrée de la démonstration importe seule la feuille de démonstration", () => {
    expect(existe(FEUILLE_DE_F002)).toBe(false);
    expect(disque.filter((chemin) => chemin.endsWith(".css"))).toEqual([
      FEUILLE_DE_DEMONSTRATION,
      FEUILLE_D_ENTREE,
      FICHIER_DES_JETONS,
    ]);
    expect(GABARITS).toEqual(["demo.html", "index.html"]);
    expect(HORS_DE_SRC.filter((chemin) => /\.(?:css|scss|sass|less|pcss)$/.test(chemin))).toEqual(
      [],
    );
    expect(lister("src").filter((chemin) => /\.(?:scss|sass|less|pcss)$/.test(chemin))).toEqual([]);
    expect(controlerFeuilles(textes)).toEqual([]);
    const feuillesImportees = Object.fromEntries(
      disque
        .filter((chemin) => /\.tsx?$/.test(chemin))
        .map((chemin) => [chemin, lire(chemin).match(/^import "[^"]*\.css";$/gm) ?? []] as const)
        .filter(([, imports]) => imports.length > 0),
    );
    expect(feuillesImportees).toEqual({
      [ENTREE_DE_LA_DEMONSTRATION]: ['import "./demonstration.css";'],
      "src/main.tsx": ['import "./styles/entree.css";'],
    });
  });

  it("F-004-AC3 F-004-AC19 chaque classe d'un fichier analysé par Tailwind est nommée ou bâtie sur un jeton ; un fichier de l'application n'emploie aucune classe de la feuille de démonstration", () => {
    expect(analyses.length).toBeGreaterThanOrEqual(10);
    for (const chemin of analyses) {
      expect(controlerClasses(chemin, lire(chemin), contexte), chemin).toEqual([]);
    }
    expect(analysesDeLaPage).toEqual(["demo.html", "src/demonstration/page.classes.ts"]);
    for (const chemin of analysesDeLaPage) {
      expect(controlerClasses(chemin, lire(chemin), contexteDeLaPage), chemin).toEqual([]);
    }
    expect(contexte.utilitaires.has("grille-auto")).toBe(false);
    expect(contexteDeLaPage.utilitaires.has("grille-auto")).toBe(true);
  });

  it("F-004-AC23 F-004-AC50 l'analyse de Tailwind est bornée : la feuille d'entrée ne désigne que les fichiers de classes des composants, la feuille de démonstration ceux de la page et son gabarit", () => {
    expect(controlerSources(entree, disque, controles)).toEqual([]);
    expect(sourcesDe(entree)).toEqual(["src/interface/composants/*.classes.ts"]);
    expect(
      analyses.every((chemin) => /^src\/interface\/composants\/[^/]+\.classes\.ts$/.test(chemin)),
    ).toBe(true);
    expect(controlerFeuilleDeDemonstration(demonstration, disque, controles)).toEqual([]);
    expect(sourcesDe(demonstration, FEUILLE_DE_DEMONSTRATION)).toEqual([
      "src/demonstration/*.classes.ts",
      "demo.html",
    ]);
    expect(analyses.filter((chemin) => analysesDeLaPage.includes(chemin))).toEqual([]);
    for (const feuille of [entree, jetons]) {
      expect(feuille).not.toMatch(/demonstration|demo\.html/);
    }
  });

  it("F-004-AC3 hors des fichiers analysés, aucun composant n'écrit une classe en dur", () => {
    expect(
      [...textes.keys()].filter((chemin) => /^src\/.*\.tsx$/.test(chemin)).length,
    ).toBeGreaterThanOrEqual(18);
    expect(controlerClassesEnDur(textes)).toEqual([]);
  });

  it("F-004-AC6 F-004-AC10 thème sombre sur la racine, contour de focus global au jeton", () => {
    expect(controlerBase(entree, jetons)).toEqual([]);
  });

  it("F-004-AC6 la couleur de thème de chaque gabarit est celle du fond de l'application", () => {
    for (const gabarit of GABARITS) {
      expect(controlerCouleurDeTheme(gabarit, lire(gabarit), jetons)).toEqual([]);
    }
  });

  it("F-004-AC47 le dégradé d'accent n'est consommé qu'aux emplacements de la liste fermée, une fois chacun", () => {
    expect(EMPLACEMENTS_DE_L_ACCENT).toEqual([
      "src/interface/composants/barre.classes.ts",
      "src/interface/composants/rangee.classes.ts",
      "src/styles/entree.css",
    ]);
    expect(controlerConsommateursDeLAccent(textes)).toEqual([]);
  });

  it("F-004-AC48 le halo est une classe nommée, immobile, qui ne reçoit aucun pointeur", () => {
    expect(controlerHalo(entree, lire("src/interface/composants/etats.classes.ts"))).toEqual([]);
  });

  // F-030-AC29 remplace l'interdit de F-004-AC40 : l'affirmation existe, avec une seule définition
  // et un seul lecteur, qui ne la donne qu'une fois la preuve d'écriture faite.
  it("F-004-AC40 F-030-AC29 le texte d'échec, l'affirmation d'enregistrement et l'annonce de reprise ne sont écrits qu'une fois, dans les messages, et l'affirmation et l'annonce n'ont qu'un lecteur, l'écran d'enregistrement", () => {
    for (const texte of [
      "Non enregistré sur cet appareil",
      "Enregistré sur cet appareil",
      "Modifications enregistrées sur cet appareil.",
    ]) {
      expect(controlerSeulAuteur(textes, texte, MESSAGES), texte).toEqual([]);
    }
    for (const nom of ["ENREGISTRE", "ANNONCE_DE_REPRISE"]) {
      expect(controlerSeulLecteur(textes, nom, MESSAGES, ECRAN_D_ENREGISTREMENT), nom).toEqual([]);
    }
  });
});

// ── Fichiers de classes : lus par leur seul dossier, sans clé morte ──────────────────────────────

const FICHIER_DE_CLASSES = /\.classes\.ts$/;
const IMPORT = /import\s+[^;"]*?\sfrom\s+"([^"]+)";/g;

/** Imports d'un fichier de classes depuis un autre dossier que le sien. */
function classesLuesDAilleurs(fichiers: ReadonlyMap<string, string>): string[] {
  return [...fichiers].flatMap(([chemin, texte]) =>
    [...texte.matchAll(IMPORT)]
      .map(([, cible = ""]) => cible)
      .filter((cible) => FICHIER_DE_CLASSES.test(cible) && !/^\.\/[^/]+$/.test(cible))
      .map((cible) => `${chemin} : classes d'un autre dossier : « ${cible} »`),
  );
}

/** Ce qu'un fichier de classes exporte : « NOM.cle » pour un objet, « NOM » pour une chaîne. */
function exportsDeClasses(texte: string): string[] {
  return [...texte.matchAll(/^export const (\w+) =\s*(\{[\s\S]*?^\}|[^{])/gm)].flatMap(
    ([, nom = "", corps = ""]) =>
      corps.startsWith("{")
        ? [...corps.matchAll(/^ {2}(\w+):/gm)].map(([, cle = ""]) => `${nom}.${cle}`)
        : [nom],
  );
}

/** Classes exportées qu'aucun autre fichier ne lit ; « NOM[…] » lit toutes les clés de NOM. */
function classesSansLecteur(fichiers: ReadonlyMap<string, string>): string[] {
  const lecteurs = [...fichiers]
    .filter(([chemin]) => !FICHIER_DE_CLASSES.test(chemin))
    .map(([, texte]) => texte.replace(IMPORT, ""));
  return [...fichiers]
    .filter(([chemin]) => FICHIER_DE_CLASSES.test(chemin))
    .flatMap(([chemin, texte]) =>
      exportsDeClasses(texte)
        .filter((exporte) => {
          const [nom = ""] = exporte.split(".");
          const lecture = new RegExp(`\\b(?:${exporte.replace(".", "\\.")}\\b|${nom}\\[)`);
          return !lecteurs.some((lecteur) => lecture.test(lecteur));
        })
        .map((exporte) => `${chemin} : ${exporte} n'a aucun lecteur`),
    );
}

describe("fichiers de classes", () => {
  it("F-004-AC16 un fichier de classes n'est lu que par les fichiers de son dossier : hors des composants, l'application rend des composants et n'habille aucune balise", () => {
    // Treize depuis F-010 : compte.classes.ts, la zone et les écrans de compte ; quatorze depuis
    // F-018 : table.classes.ts, l'écran de table ; quinze depuis F-020 : kanban.classes.ts, la vue
    // kanban ; seize depuis F-021 : calendrier.classes.ts.
    expect([...textes.keys()].filter((chemin) => FICHIER_DE_CLASSES.test(chemin)).length).toBe(16);
    expect(classesLuesDAilleurs(textes)).toEqual([]);
  });

  it("F-004-AC21 F-004-AC16 un fichier de classes lu depuis un autre dossier est nommé", () => {
    const conforme = 'import { COQUILLE } from "./coquille.classes.ts";';
    expect(classesLuesDAilleurs(new Map([["src/interface/composants/A.tsx", conforme]]))).toEqual(
      [],
    );
    expect(
      classesLuesDAilleurs(
        new Map([
          ["src/interface/A.tsx", 'import { COQUILLE } from "./composants/coquille.classes.ts";'],
          [
            "src/demonstration/B.tsx",
            'import { RANGEE } from "../interface/composants/rangee.classes.ts";',
          ],
        ]),
      ),
    ).toEqual([
      "src/interface/A.tsx : classes d'un autre dossier : « ./composants/coquille.classes.ts »",
      "src/demonstration/B.tsx : classes d'un autre dossier : « ../interface/composants/rangee.classes.ts »",
    ]);
  });

  it("F-004-AC3 chaque classe exportée par un fichier de classes a un lecteur : Tailwind ne produit aucune règle pour une clé morte", () => {
    expect(classesSansLecteur(textes)).toEqual([]);
  });

  it("F-004-AC21 F-004-AC3 une clé de classes sans lecteur est nommée, une constante aussi ; un accès par indice lit toutes les clés", () => {
    const classes =
      'export const A = {\n  lue: "flex",\n  morte:\n    "grid",\n} as const;\nexport const B = "flex";\nexport const C = `${X} grid`;\n';
    const fichiers = (lecteur: string): Map<string, string> =>
      new Map([
        ["src/a.classes.ts", classes],
        ["src/A.tsx", `import { A, B, C } from "./a.classes.ts";\n${lecteur}`],
      ]);
    expect(classesSansLecteur(fichiers("<p className={A.lue + B + C} />"))).toEqual([
      "src/a.classes.ts : A.morte n'a aucun lecteur",
    ]);
    expect(classesSansLecteur(fichiers("<p className={A[cle]} />"))).toEqual([
      "src/a.classes.ts : B n'a aucun lecteur",
      "src/a.classes.ts : C n'a aucun lecteur",
    ]);
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

  it("F-003-AC44 F-004-AC10 la seule suppression du contour admise est la règle nommée de la zone de saisie, une fois, dans la feuille d'entrée : ailleurs, répétée, sous un autre nom ou sur un autre sélecteur, elle est refusée", () => {
    const regle =
      "@utility saisie-sans-contour {\n  & [contenteditable] {\n    outline: none;\n  }\n}\n";
    const refus = (chemin: string): string[] => [
      `${chemin} : contour de focus supprimé : « outline: none »`,
    ];

    expect(lire("src/styles/entree.css")).toContain(regle);
    expect(fautesDe("src/styles/entree.css", regle)).toEqual([]);
    expect(fautesDe("src/styles/entree.css", `${regle}${regle}`)).toEqual(
      refus("src/styles/entree.css"),
    );
    expect(fautesDe("src/demonstration/demonstration.css", regle)).toEqual(
      refus("src/demonstration/demonstration.css"),
    );
    expect(
      fautesDe("src/styles/entree.css", regle.replace("saisie-sans-contour", "autre-zone")),
    ).toEqual(refus("src/styles/entree.css"));
    expect(fautesDe("src/styles/entree.css", regle.replace("[contenteditable]", "button"))).toEqual(
      refus("src/styles/entree.css"),
    );
    expect(fautesDe("src/styles/entree.css", `${regle}a:focus-visible { outline: none; }`)).toEqual(
      refus("src/styles/entree.css"),
    );
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

  it("F-004-AC53 F-030-AC29 l'affirmation recopiée hors des messages, lue par un second fichier, lue deux fois par son lecteur, ou définie deux fois, est nommée ; une définition et un lecteur passent", () => {
    const affirmation = "Enregistré sur cet appareil";
    const conforme = new Map([
      [MESSAGES, `export const ENREGISTRE = "${affirmation}";\nexport const NON_ENREGISTRE = "x";`],
      [
        ECRAN_D_ENREGISTREMENT,
        'import { ENREGISTRE, NON_ENREGISTRE } from "./messages.ts";\n<ZoneEtat affirmation={ENREGISTRE} />',
      ],
      ["src/interface/Application.tsx", "<ZoneDEnregistrement etat={etat} />"],
    ]);
    expect(controlerSeulAuteur(conforme, affirmation, MESSAGES)).toEqual([]);
    expect(controlerSeulLecteur(conforme, "ENREGISTRE", MESSAGES, ECRAN_D_ENREGISTREMENT)).toEqual(
      [],
    );
    const recopiee = new Map([...conforme, ["src/interface/A.tsx", `<p>${affirmation}</p>`]]);
    expect(controlerSeulAuteur(recopiee, affirmation, MESSAGES)).toEqual([
      `src/interface/A.tsx : écrit « ${affirmation} », que seul ${MESSAGES} doit écrire`,
    ]);
    const second = new Map([...conforme, ["src/interface/B.tsx", "<p>{ENREGISTRE}</p>"]]);
    expect(controlerSeulLecteur(second, "ENREGISTRE", MESSAGES, ECRAN_D_ENREGISTREMENT)).toEqual([
      `src/interface/B.tsx : nomme ENREGISTRE, que seul ${ECRAN_D_ENREGISTREMENT} doit lire`,
    ]);
    const deuxLectures = new Map([
      ...conforme,
      [ECRAN_D_ENREGISTREMENT, `${conforme.get(ECRAN_D_ENREGISTREMENT)}\n<p>{ENREGISTRE}</p>`],
    ]);
    expect(
      controlerSeulLecteur(deuxLectures, "ENREGISTRE", MESSAGES, ECRAN_D_ENREGISTREMENT),
    ).toEqual([`${ECRAN_D_ENREGISTREMENT} : nomme ENREGISTRE 3 fois, 2 attendue(s)`]);
    const sansLecteur = new Map([[MESSAGES, conforme.get(MESSAGES) ?? ""]]);
    expect(
      controlerSeulLecteur(sansLecteur, "ENREGISTRE", MESSAGES, ECRAN_D_ENREGISTREMENT),
    ).toEqual([`${ECRAN_D_ENREGISTREMENT} : nomme ENREGISTRE 0 fois, 2 attendue(s)`]);
  });

  it("F-004-AC53 F-004-AC40 le texte d'échec écrit ailleurs que dans les messages, ou disparu des messages, est nommé", () => {
    const echec = "Non enregistré sur cet appareil";
    const messages = "src/interface/messages.ts";
    const conforme = new Map([
      [messages, `export const NON_ENREGISTRE = "${echec}";`],
      ["src/interface/Application.tsx", "<ZoneEtat echec={NON_ENREGISTRE} />"],
    ]);
    expect(controlerSeulAuteur(conforme, echec, messages)).toEqual([]);
    const recopie = new Map([...conforme, ["src/interface/A.tsx", `<p>${echec}</p>`]]);
    expect(controlerSeulAuteur(recopie, echec, messages)).toEqual([
      `src/interface/A.tsx : écrit « ${echec} », que seul ${messages} doit écrire`,
    ]);
    expect(controlerSeulAuteur(new Map([[messages, ""]]), echec, messages)).toEqual([
      `${messages} : n'écrit plus « ${echec} »`,
    ]);
  });

  it("F-004-AC53 F-004-AC47 un troisième consommateur du dégradé d'accent est nommé, comme un second emploi dans un fichier admis ou un emplacement de la liste qui ne l'emploie plus", () => {
    const conforme = new Map([
      [FICHIER_DES_JETONS, "--degrade-accent: linear-gradient(var(--a), var(--b));"],
      [FEUILLE_D_ENTREE, "@utility fond-accent { background-image: var(--degrade-accent); }"],
      ["src/interface/composants/barre.classes.ts", 'sceau: "fond-accent relative size-sceau",'],
      ["src/interface/composants/rangee.classes.ts", 'repere: "fond-accent absolute w-repere",'],
      ["src/interface/composants/menu.classes.ts", 'cadre: "bg-surface-relief fond-accentue",'],
    ]);
    expect(controlerConsommateursDeLAccent(conforme)).toEqual([]);

    const troisieme = "src/interface/composants/bouton.classes.ts";
    expect(
      controlerConsommateursDeLAccent(
        new Map([...conforme, [troisieme, 'export const BOUTON = "fond-accent rounded-petit";']]),
      ),
    ).toEqual([`${troisieme} : consomme le dégradé d'accent hors de la liste fermée`]);
    expect(
      controlerConsommateursDeLAccent(
        new Map([
          ...conforme,
          ["src/demonstration/demonstration.css", ".a { background: var(--degrade-accent); }"],
        ]),
      ),
    ).toEqual([
      "src/demonstration/demonstration.css : consomme le dégradé d'accent hors de la liste fermée",
    ]);
    const barre = "src/interface/composants/barre.classes.ts";
    expect(
      controlerConsommateursDeLAccent(
        new Map([
          ...conforme,
          [barre, 'sceau: "fond-accent",\n  nouvellePage: "fond-accent px-petit",'],
        ]),
      ),
    ).toEqual([`${barre} : 2 emplois du dégradé d'accent, un seul attendu`]);
    expect(
      controlerConsommateursDeLAccent(new Map([...conforme, [barre, 'sceau: "size-sceau",']])),
    ).toEqual([`${barre} : 0 emplois du dégradé d'accent, un seul attendu`]);
  });

  it("F-004-AC53 F-004-AC48 un halo qui reçoit le pointeur, qui s'anime, ou dont la classe peint autre chose que son jeton est nommé", () => {
    const feuille = "@utility fond-halo {\n  background-image: var(--degrade-halo);\n}";
    const classes = 'halo: "fond-halo pointer-events-none absolute inset-x-nul top-nul h-halo",';
    expect(controlerHalo(feuille, classes)).toEqual([]);
    expect(controlerHalo(feuille, classes.replace("pointer-events-none ", ""))).toEqual([
      "halo : la classe « pointer-events-none » manque",
    ]);
    expect(controlerHalo(feuille, classes.replace("absolute", "apparition"))).toEqual([
      "halo : la classe « absolute » manque",
      "halo : il doit rester immobile, « apparition » l'anime",
    ]);
    expect(controlerHalo(feuille.replace("--degrade-halo", "--degrade-accent"), classes)).toEqual([
      "src/styles/entree.css : la classe fond-halo ne peint pas le seul jeton --degrade-halo",
    ]);
    expect(controlerHalo(feuille, 'zone: "relative",')).toHaveLength(3);
  });

  it("F-004-AC21 F-004-AC3 une classe écrite en dur dans un composant est nommée, sous ses trois écritures ; une classe lue d'un fichier de classes est permise", () => {
    const conforme = new Map([
      ["src/interface/A.tsx", "<div className={A.cadre} />"],
      ["src/interface/a.classes.ts", 'export const A = { cadre: "flex" };'],
    ]);
    expect(controlerClassesEnDur(conforme)).toEqual([]);
    for (const ecriture of ['className="flex"', "className={'flex'}", "className={`flex ${a}`}"]) {
      expect(
        controlerClassesEnDur(new Map([...conforme, ["src/interface/B.tsx", `<p ${ecriture} />`]])),
        ecriture,
      ).toEqual(["src/interface/B.tsx : classe écrite en dur dans un composant"]);
    }
  });

  it("F-004-AC21 F-004-AC5 F-004-AC3 une taille de texte ou une hauteur de ligne en pixels est refusée dans une feuille, dans un @utility comme ailleurs, et en style en ligne", () => {
    const conforme =
      "@utility legende {\n  font-size: var(--text-petit);\n  line-height: var(--text-petit--line-height);\n}\nbody { font-size: 1rem; line-height: 1.5; padding: 1px; }";
    expect(fautesDe("src/styles/entree.css", conforme)).toEqual([]);
    expect(fautesDe("src/demonstration/demonstration.css", conforme)).toEqual([]);
    const faute = "taille de texte ou hauteur de ligne en pixels, hors des unités relatives";
    expect(
      fautesDe("src/styles/entree.css", conforme.replace("var(--text-petit);", "14px;")),
    ).toEqual([`src/styles/entree.css : ${faute} : « font-size: 14px »`]);
    expect(
      fautesDe(
        "src/demonstration/demonstration.css",
        conforme.replace("var(--text-petit--line-height)", "20px"),
      ),
    ).toEqual([`src/demonstration/demonstration.css : ${faute} : « line-height: 20px »`]);
    expect(fautesDe("src/a.css", "p { font: 12pt/1.5 serif; }")).toEqual([
      `src/a.css : ${faute} : « font: 12pt »`,
    ]);
    expect(fautesDe("src/a.tsx", "<p style={{ fontSize: 14 }} />")).toEqual([
      `src/a.tsx : ${faute} : « fontSize: 1 »`,
    ]);
    expect(fautesDe("src/a.tsx", '<p style={{ lineHeight: "20px" }} />')).toHaveLength(1);
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

  it("F-004-AC21 F-004-AC3 F-005-AC34 la géométrie posée en ligne : celle de la barre de blocs et celle du menu slash sont admises, et elles seules", () => {
    const geometrie =
      ".a { left: calc(var(--barre-gauche, 0) * 1px); top: calc(var(--barre-haut, 0) * 1px); } .b { left: calc(var(--menu-x, 0) * 1px); top: calc(var(--menu-y, 0) * 1px); }";
    expect(fautesDe("src/a.css", geometrie)).toEqual([]);
    expect(fautesDe("src/a.css", ".a { left: calc(var(--menu-z, 0) * 1px); }")).toEqual([
      "src/a.css : jeton non déclaré : « --menu-z »",
    ]);
    expect(fautesDe("src/a.css", ".a { left: calc(var(--menu-xy, 0) * 1px); }")).toEqual([
      "src/a.css : jeton non déclaré : « --menu-xy »",
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

  it("F-004-AC21 F-004-AC50 une classe de la feuille de démonstration est refusée dans un fichier de l'application, permise dans un fichier de la page", () => {
    const source = 'export const A = "grille-auto hauteur-apercu";';
    expect(controlerClasses("src/demonstration/a.classes.ts", source, contexteDeLaPage)).toEqual(
      [],
    );
    expect(controlerClasses("src/interface/composants/a.classes.ts", source, contexte)).toEqual([
      "src/interface/composants/a.classes.ts : « grille-auto » : classe qui n'est ni nommée par le projet ni bâtie sur un jeton",
      "src/interface/composants/a.classes.ts : « hauteur-apercu » : classe qui n'est ni nommée par le projet ni bâtie sur un jeton",
    ]);
  });

  it("F-004-AC50 les classes propres à la démonstration se calculent depuis les sources : celles que sa feuille déclare, et celles que ses fichiers emploient seuls", () => {
    const propres = classesDeLaSeuleDemonstration(
      demonstration,
      new Map(analysesDeLaPage.map((chemin) => [chemin, lire(chemin)])),
      new Map(analyses.map((chemin) => [chemin, lire(chemin)])),
    );
    for (const classe of ["grille-auto", "hauteur-apercu", "repere-des-fixes", "gap-vaste"]) {
      expect(propres, classe).toContain(classe);
    }
    for (const classe of ["flex", "filet", "bg-surface-application", "text-texte-principal"]) {
      expect(propres, classe).not.toContain(classe);
    }
    expect(propres.length).toBeGreaterThanOrEqual(10);
  });

  it("F-004-AC21 F-004-AC50 une feuille construite qui porte une classe propre à la démonstration est vue, variante et classe voisine comprises", () => {
    const propres = classesDeLaSeuleDemonstration(
      "@utility grille-auto { display: grid; }",
      new Map([
        ["src/demonstration/a.classes.ts", 'export const A = "flex gap-vaste etroit:px-grand";'],
      ]),
      new Map([["src/interface/composants/a.classes.ts", 'export const A = "flex";']]),
    );
    expect(propres).toEqual(["etroit:px-grand", "gap-vaste", "grille-auto"]);
    expect(classesPortees(".flex{display:flex}.gap-vaste-x{gap:1rem}", propres)).toEqual([]);
    expect(
      classesPortees(
        ".gap-vaste{gap:3rem}@media (width>=51rem){.etroit\\:px-grand{padding:0}}",
        propres,
      ),
    ).toEqual(["etroit:px-grand", "gap-vaste"]);
    expect(classesPortees(".grille-auto,.a{display:grid}", propres)).toEqual(["grille-auto"]);
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
    '@import "tailwindcss" source(none);\n@source "../interface/composants/*.classes.ts";\n@import "./jetons.css";';
  const DISQUE = ["src/interface/composants/a.classes.ts", "src/main.tsx"];
  const DISQUE_DE_LA_PAGE = ["src/demonstration/page.classes.ts", "src/main.tsx"];

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
      "src/interface/composants/a.classes.ts : analysé par Tailwind sans être contrôlé",
    ]);
    expect(
      controlerSources(ENTREE.replace('@import "./jetons.css";', ""), DISQUE, DISQUE),
    ).toHaveLength(1);
  });

  it("F-004-AC21 F-004-AC23 F-004-AC50 la feuille d'entrée ne désigne aucun fichier de la page de démonstration", () => {
    const disque = [...DISQUE, "src/demonstration/page.classes.ts", "demo.html"];
    expect(controlerSources(ENTREE, disque, disque)).toEqual([]);
    expect(
      controlerSources(`${ENTREE}\n@source "../demonstration/*.classes.ts";`, disque, disque),
    ).toEqual([
      "src/styles/entree.css : @source vers la page de démonstration, que la production n'embarque pas : « src/demonstration/*.classes.ts »",
    ]);
    expect(controlerSources(`${ENTREE}\n@source "../../demo.html";`, disque, disque)).toEqual([
      "src/styles/entree.css : @source vers la page de démonstration, que la production n'embarque pas : « demo.html »",
    ]);
  });

  it("F-004-AC21 F-004-AC23 la feuille de démonstration : conforme, puis chaque défaut", () => {
    const FEUILLE =
      '@import "../styles/entree.css";\n@source "./*.classes.ts";\n@utility a { contain: layout; }';
    const fautes = (texte: string, controles = DISQUE_DE_LA_PAGE): string[] =>
      controlerFeuilleDeDemonstration(texte, DISQUE_DE_LA_PAGE, controles);
    expect(fautes(FEUILLE)).toEqual([]);
    expect(fautes(FEUILLE.replace('@import "../styles/entree.css";', ""))).toEqual([
      "src/demonstration/demonstration.css : la feuille d'entrée n'est pas importée",
    ]);
    expect(fautes(`@import "tailwindcss";\n${FEUILLE}`)).toEqual([
      "src/demonstration/demonstration.css : import autre que la feuille d'entrée : « tailwindcss »",
    ]);
    expect(fautes(`${FEUILLE}\n@import "../styles/jetons.css";`)).toEqual([
      "src/demonstration/demonstration.css : import autre que la feuille d'entrée : « ../styles/jetons.css »",
    ]);
    expect(fautes(`${FEUILLE}\n@theme { --spacing-apercu: 30rem; }`)).toEqual([
      "src/demonstration/demonstration.css : jeton déclaré hors du fichier des jetons : « @theme »",
    ]);
    expect(fautes(`${FEUILLE}\n:root { --spacing-apercu: 30rem; }`)).toEqual([
      "src/demonstration/demonstration.css : jeton déclaré hors du fichier des jetons : « --spacing-apercu »",
    ]);
    expect(fautes(`${FEUILLE}\n@source "../../dist";`)).toEqual([
      "src/demonstration/demonstration.css : @source hors des sources d'apps/web : « dist »",
    ]);
    expect(fautes(`${FEUILLE}\n@source "../absent/*.ts";`)).toEqual([
      "src/demonstration/demonstration.css : @source qui ne désigne aucun fichier : « src/absent/*.ts »",
    ]);
    expect(fautes(FEUILLE, ["src/main.tsx"])).toEqual([
      "src/demonstration/page.classes.ts : analysé par Tailwind sans être contrôlé",
    ]);
    expect(
      fautesDe(
        "src/demonstration/demonstration.css",
        "@utility a { width: var(--spacing-absent); }",
      ),
    ).toEqual(["src/demonstration/demonstration.css : jeton non déclaré : « --spacing-absent »"]);
  });

  it("F-004-AC21 F-004-AC23 F-004-AC50 feuilles énumérées : trois seulement, Tailwind et les jetons importés par la seule feuille d'entrée, la feuille de démonstration par sa seule entrée", () => {
    const conforme = new Map([
      [FEUILLE_D_ENTREE, '@import "tailwindcss" source(none);\n@import "./jetons.css";'],
      [FICHIER_DES_JETONS, "@theme static { --spacing-nul: 0rem; }"],
      [FEUILLE_DE_DEMONSTRATION, '@import "../styles/entree.css";'],
      [ENTREE_DE_LA_DEMONSTRATION, 'import "./demonstration.css";\n'],
      ["src/main.tsx", 'import "./styles/entree.css";\n'],
    ]);
    const avec = (chemin: string, texte: string): string[] =>
      controlerFeuilles(new Map([...conforme, [chemin, texte]]));
    expect(controlerFeuilles(conforme)).toEqual([]);
    expect(avec("src/interface/autre.css", ".a { display: none; }")).toEqual([
      "src/interface/autre.css : feuille CSS hors des trois admises",
    ]);
    expect(avec(FEUILLE_DE_DEMONSTRATION, '@import "tailwindcss";')).toEqual([
      "src/demonstration/demonstration.css : import réservé à la feuille d'entrée : « tailwindcss »",
    ]);
    expect(avec(FEUILLE_DE_DEMONSTRATION, '@import "../styles/jetons.css";')).toEqual([
      "src/demonstration/demonstration.css : import réservé à la feuille d'entrée : « ../styles/jetons.css »",
    ]);
    expect(avec("src/main.tsx", 'import "./demonstration/demonstration.css";\n')).toEqual([
      "src/main.tsx : la feuille de démonstration n'est importée que par son entrée",
    ]);
    expect(avec(FEUILLE_D_ENTREE, '@import "../demonstration/demonstration.css";')).toEqual([
      "src/styles/entree.css : la feuille de démonstration n'est importée que par son entrée",
    ]);
    expect(avec(ENTREE_DE_LA_DEMONSTRATION, 'import "../styles/entree.css";\n')).toEqual([
      "src/demonstration/entree.tsx : la feuille de démonstration n'est pas importée",
    ]);
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
