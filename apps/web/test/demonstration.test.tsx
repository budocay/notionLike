// Page de démonstration (F-004-AC50) et liste des captures (F-004-AC51) : la page montre chaque
// composant de présentation, sur des données fictives, et rien de l'entrée de production ne
// l'atteint. Les sources sont lues sur le disque ; le rendu est celui de jsdom, sans styles.
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  type CaptureAttendue,
  CAPTURES_ATTENDUES,
  DOSSIER_DES_CAPTURES,
  ECRANS_DE_REFERENCE,
  LARGEURS_DE_CAPTURE,
  nomDeCapture,
} from "../e2e/captures-attendues.ts";
import {
  AFFIRMATION_FICTIVE,
  ENTREE_DE_PIED_FICTIVE,
  PAGE_COURANTE,
  TITRE_LONG,
} from "../src/demonstration/donnees.ts";
import { MARQUEUR_DE_DEMONSTRATION } from "../src/demonstration/marqueur.ts";
import { PageDemonstration } from "../src/demonstration/PageDemonstration.tsx";
import { BARRE } from "../src/interface/composants/barre.classes.ts";
import {
  CLASSES_DE_ROLE,
  CodeColore,
  type RoleSyntaxique,
} from "../src/interface/composants/Edition.tsx";
import { messageErreur } from "../src/interface/messages.ts";
import { lireJetons } from "../src/styles/lecture-jetons.ts";
import { lire, lireDossier } from "./aides-disque.ts";
import { type Aretes, atteintsDepuis, graphe } from "./aides-graphe.ts";
import { FEUILLE_D_ENTREE, FEUILLE_DE_DEMONSTRATION } from "./aides-styles.ts";

const sources = lireDossier("src");

/** Les rôles de la liste fermée qu'aucun élément de ce conteneur ne porte (F-033-AC14). */
function rolesAbsents(conteneur: Element): RoleSyntaxique[] {
  return (Object.keys(CLASSES_DE_ROLE) as RoleSyntaxique[]).filter(
    (role) => conteneur.getElementsByClassName(CLASSES_DE_ROLE[role]).length === 0,
  );
}
const jetons = lire("src/styles/jetons.css");
const PAGE = "src/demonstration/PageDemonstration.tsx";
const ENTREE_DE_PRODUCTION = "src/main.tsx";

afterEach(cleanup);

/** Composants exportés par les fichiers de `src/interface/composants/`. */
function composantsExportes(fichiers: ReadonlyMap<string, string>): string[] {
  return [...fichiers]
    .filter(([chemin]) => /^src\/interface\/composants\/[^/]+\.tsx$/.test(chemin))
    .flatMap(([, texte]) => [...texte.matchAll(/export function ([A-Z]\w*)\(/g)])
    .map(([, nom = ""]) => nom);
}

function composantsManquants(fichiers: ReadonlyMap<string, string>, page: string): string[] {
  return composantsExportes(fichiers).filter((nom) => !new RegExp(`<${nom}[\\s/>]`).test(page));
}

function dansLaDemonstration(chemins: Iterable<string>): string[] {
  return [...chemins].filter((chemin) => chemin.startsWith("src/demonstration/"));
}

type Constat = (page: HTMLElement) => boolean;

function rangees(page: HTMLElement, selecteur = "li[aria-level]"): HTMLElement[] {
  return [...page.querySelectorAll<HTMLElement>(selecteur)];
}

function alertes(page: HTMLElement): string[] {
  return [...page.querySelectorAll('[role="alert"]')].map((alerte) => alerte.textContent);
}

function fils(page: HTMLElement, replie: boolean): Element[] {
  return [...page.querySelectorAll('nav[aria-label="Fil d\'Ariane"]')].filter(
    (fil) => (fil.querySelector("button") !== null) === replie,
  );
}

function zonesDEtat(page: HTMLElement): string[] {
  return [...page.querySelectorAll("header [role='status']")].map((zone) => zone.textContent);
}

/** Alertes de la page qui portent ce titre ou non, ce nombre de phrases et cette commande ou non. */
function alertesDeForme(
  page: HTMLElement,
  forme: { readonly titre: boolean; readonly phrases: number; readonly commande: string | null },
): Element[] {
  return [...page.querySelectorAll('[role="alert"]')].filter(
    (alerte) =>
      (alerte.querySelector("h1") !== null) === forme.titre &&
      alerte.querySelectorAll("p").length === forme.phrases &&
      (alerte.querySelector("button")?.textContent ?? null) === forme.commande,
  );
}

/**
 * Les états que F-004-AC50 nomme, puis les trois formes que F-030 leur a ajoutées (zone d'état
 * affirmée, avertissement à deux phrases avec commande, écran bloquant avec précision), et ce qui
 * prouve que la page rend chacun.
 */
const ETATS_NOMMES: Readonly<Record<string, Constat>> = {
  "rangée au repos": (page) =>
    rangees(page).some(
      (rangee) =>
        rangee.closest("[data-force]") === null &&
        rangee.querySelector('[aria-current], input, [role="menu"]') === null,
    ),
  "rangée survolée": (page) => rangees(page, '[data-force^="hover:.rangee"] li').length > 0,
  "rangée avec focus": (page) => rangees(page, '[data-force*="focus-visible:a"] li').length > 0,
  "rangée courante": (page) => rangees(page, "li:has(a[aria-current='page'])").length > 0,
  "rangée en renommage": (page) => rangees(page, "li:has(input[aria-invalid='false'])").length > 0,
  "rangée à titre long": (page) =>
    rangees(page).some((rangee) => rangee.querySelector("a")?.textContent === TITRE_LONG),
  "menu « ⋯ »": (page) => page.querySelectorAll('[role="menu"] [role="menuitem"]').length === 3,
  "tête de barre latérale": (page) =>
    page.querySelector('nav[aria-label="Pages"] > div:first-child button') !== null,
  "pied de barre latérale": (page) =>
    [...page.querySelectorAll('nav[aria-label="Pages"]')].some(
      (barre) => barre.lastElementChild?.className === BARRE.pied,
    ),
  "tiroir et voile": (page) =>
    page.querySelector('[role="dialog"][aria-modal="true"] ~ [data-voile]') !== null,
  "barre du haut": (page) => page.querySelector("header [role='status']") !== null,
  "fil d'Ariane non replié": (page) => fils(page, false).length > 0,
  "fil d'Ariane replié": (page) => fils(page, true).length > 0,
  "zone d'état vide": (page) => zonesDEtat(page).includes(""),
  "zone d'état en échec": (page) => zonesDEtat(page).includes("Non enregistré sur cet appareil"),
  "titre de page": (page) =>
    [...page.querySelectorAll("main h1")].some((titre) => titre.textContent === PAGE_COURANTE),
  "état de chargement": (page) =>
    [...page.querySelectorAll('[role="status"]')].some(
      (etat) => etat.textContent === "Chargement…",
    ),
  "message d'erreur": (page) =>
    alertes(page).includes(messageErreur("titre-trop-long")) &&
    alertes(page).includes(messageErreur("page-introuvable")),
  "message d'avertissement": (page) =>
    alertes(page).some((texte) => texte.startsWith("Stockage de l'appareil indisponible")),
  "zone d'état affirmée": (page) => zonesDEtat(page).includes(AFFIRMATION_FICTIVE),
  "avertissement à deux phrases avec commande": (page) =>
    alertesDeForme(page, { titre: false, phrases: 2, commande: "Réessayer maintenant" }).length > 0,
  "écran bloquant avec précision": (page) =>
    alertesDeForme(page, { titre: true, phrases: 2, commande: null }).length > 0,
};

function pieds(page: HTMLElement): Element[] {
  return [...page.querySelectorAll("nav > div")].filter((zone) => zone.className === BARRE.pied);
}

function etatsManquants(page: HTMLElement): string[] {
  return Object.entries(ETATS_NOMMES)
    .filter(([, rendu]) => !rendu(page))
    .map(([nom]) => nom);
}

describe("page de démonstration : ce qu'elle montre", () => {
  it("F-004-AC50 elle montre chaque composant de présentation de la feature", () => {
    expect(composantsExportes(sources).sort()).toEqual([
      "ActionDeCompte",
      // F-014 : composants des écrans des espaces.
      "Actions",
      "Alerte",
      "Annonce",
      "Avertissement",
      "BarreDeBlocs",
      "BarreDuHaut",
      "BoiteDeDialogue",
      "Bouton",
      "BoutonIcone",
      "CadreDeBarre",
      "CadreDeCompte",
      // F-018 : composants de l'écran de table.
      // F-020 : vue kanban.
      "CarteDeKanban",
      "CaseDeCellule",
      "CelluleDeGrille",
      "ChampDeCellule",
      "ChampDeCompte",
      "ChampDeFormulaire",
      "ChampTitre",
      "Chargement",
      "CheminDePage",
      "Choix",
      // F-033 : bloc code coloré.
      "CodeColore",
      "Coquille",
      "CorpsDePage",
      "EcranBloquant",
      "EcranDEspaces",
      // F-018 : écran de table.
      "EcranDeTableCadre",
      "EcranPlein",
      "EntetePage",
      "Formulaire",
      "FormulaireDeCompte",
      "Grille",
      "InvitationDeTable",
      "Lien",
      "LienEnLecture",
      "LigneDOption",
      "ListeDOptions",
      "ListeDeChoix",
      // F-007 : liste de l'écran de la corbeille.
      "ListeDeCorbeille",
      // F-018 : marque d'une table, dans la barre latérale et la corbeille.
      "MarqueDeTable",
      "MenuActions",
      // F-005 : menu slash.
      "MenuDeCommandes",
      "NoteDePage",
      "PanneauDeLien",
      "Partie",
      "Pictogramme",
      "PileDeKanban",
      "PlateauDeKanban",
      // F-006 : poignées d'un bloc.
      "PoigneeDeBloc",
      "PoigneeDuCurseur",
      "Principale",
      "Raccourci",
      "Rangee",
      "RangeeDEnTetes",
      "RangeeDeGrille",
      "Sceau",
      "SelecteurDeVues",
      "SeparateurDeColonne",
      "SurfaceFlottante",
      "Tableau",
      "TeteDeBarre",
      "Texte",
      "TexteDeCellule",
      "ZoneDEdition",
      "ZoneDeSaisie",
      "ZoneEtat",
    ]);
    expect(composantsManquants(sources, lire(PAGE))).toEqual([]);
  });

  it("F-004-AC53 F-004-AC50 un composant absent de la page est nommé", () => {
    const fichiers = new Map([
      [
        "src/interface/composants/A.tsx",
        "export function Montre(): null {}\nexport function Oublie(): null {}",
      ],
      ["src/interface/composants/a.classes.ts", "export function Ignore(): null {}"],
    ]);
    expect(composantsManquants(fichiers, "<Montre />")).toEqual(["Oublie"]);
    expect(composantsManquants(fichiers, "<Montre /><Oublie titre='x' />")).toEqual([]);
  });

  it("F-004-AC50 elle porte son marqueur, et rend chaque état que le critère nomme sur des données fictives", () => {
    const { container } = render(<PageDemonstration jetons={jetons} />);
    expect(
      container.querySelector("[data-demonstration]")?.getAttribute("data-demonstration"),
    ).toBe(MARQUEUR_DE_DEMONSTRATION);
    // Chaque aperçu a sa zone principale ; aucune enveloppe ne prend la hauteur de la fenêtre.
    expect(container.querySelectorAll("main").length).toBeGreaterThanOrEqual(4);
    expect(container.querySelector(".h-dvh, .min-h-dvh")).toBeNull();
    expect(Object.keys(ETATS_NOMMES)).toHaveLength(22);
    expect(etatsManquants(container)).toEqual([]);
    expect(screen.getAllByRole("textbox", { name: "Titre de la page" })).toHaveLength(2);
    for (const texte of ["Page introuvable", "Mise à jour nécessaire"]) {
      expect(screen.getAllByText(texte).length, texte).toBeGreaterThanOrEqual(1);
    }
  });

  it("F-004-AC50 F-004-AC30 le pied de la barre latérale y suit l'arborescence, qui défile seule sous la tête", () => {
    const { container } = render(<PageDemonstration jetons={jetons} />);
    const pied = screen.getByText(ENTREE_DE_PIED_FICTIVE).closest("nav > div");
    const barre = pied?.parentElement;
    expect(barre?.getAttribute("aria-label")).toBe("Pages");
    expect([...(barre?.children ?? [])].map((zone) => zone.className)).toEqual([
      BARRE.tete,
      BARRE.defilement,
      BARRE.pied,
    ]);
    expect(barre?.children[1]?.querySelectorAll("li").length).toBeGreaterThanOrEqual(9);
    expect(
      within(barre as HTMLElement).queryByRole("button", { name: "Nouvelle page" }),
    ).not.toBeNull();
    // Donnée fictive : l'entrée du pied ne s'active pas, et aucune autre barre de la page n'a de pied.
    expect(pied?.querySelector("a, button")).toBeNull();
    expect(pieds(container)).toEqual([pied]);
  });

  it("F-004-AC53 F-004-AC50 un état nommé par le critère et absent de la page est nommé", () => {
    const { container } = render(<PageDemonstration jetons={jetons} />);
    const vide = document.createElement("div");
    expect(etatsManquants(vide)).toEqual(Object.keys(ETATS_NOMMES));
    // Chaque état se retire de la page, un à la fois : il est alors le seul à manquer.
    pieds(container).forEach((pied) => pied.remove());
    expect(etatsManquants(container)).toEqual(["pied de barre latérale"]);
    container.querySelectorAll("[data-voile]").forEach((voile) => voile.remove());
    expect(etatsManquants(container)).toEqual(["pied de barre latérale", "tiroir et voile"]);
    // Les formes de F-030 : la commande retirée de l'avertissement, la précision de l'écran bloquant.
    container.querySelectorAll('[role="alert"] button').forEach((bouton) => bouton.remove());
    expect(etatsManquants(container).slice(2)).toEqual([
      "avertissement à deux phrases avec commande",
    ]);
    container.querySelectorAll('[role="alert"] h1 ~ p ~ p').forEach((phrase) => phrase.remove());
    expect(etatsManquants(container).slice(3)).toEqual(["écran bloquant avec précision"]);
  });

  it("F-004-AC40 F-004-AC50 F-030-AC29 la zone d'état s'y montre vide, en échec, puis affirmée avec son repère non textuel sur un texte fictif : l'affirmation de l'application et l'annonce de reprise n'y sont jamais", () => {
    const { container } = render(<PageDemonstration jetons={jetons} />);
    const zones = [...container.querySelectorAll("header [role='status']")];
    const textes = zones.map((zone) => zone.textContent);
    expect(textes).toContain("");
    expect(textes.filter((texte) => texte !== "")).toEqual([
      "Non enregistré sur cet appareil",
      AFFIRMATION_FICTIVE,
    ]);
    const affirmee = zones.find((zone) => zone.textContent === AFFIRMATION_FICTIVE);
    expect(affirmee?.querySelector("span")?.getAttribute("aria-hidden")).toBe("true");
    expect(AFFIRMATION_FICTIVE).not.toMatch(/sur cet appareil/);
    expect(container.textContent).not.toMatch(
      /Enregistré sur cet appareil|Modifications enregistrées/,
    );
  });

  it("F-033-AC14 F-004-AC50 elle montre un bloc code coloré de chacun des dix langages, et chacun des sept rôles de la liste fermée y est porté par au moins un élément", () => {
    render(<PageDemonstration jetons={jetons} />);
    const section = screen.getByRole("heading", { name: "Coloration du bloc code" })
      .parentElement as HTMLElement;
    const codes = [...section.querySelectorAll("pre > code")];
    const classes = codes.flatMap((code) =>
      [...code.querySelectorAll("[class]")].map((element) => element.className),
    );

    expect(codes).toHaveLength(10);
    expect(Object.keys(CLASSES_DE_ROLE)).toHaveLength(7);
    expect(rolesAbsents(section)).toEqual([]);
    expect(
      classes.filter((classe) => !Object.values<string>(CLASSES_DE_ROLE).includes(classe)),
    ).toEqual([]);
    // Les étiquettes des spécimens : un par langage, puis celui de la barre.
    expect(
      [...section.querySelectorAll(":scope > div > span")].map(
        (etiquette) => etiquette.textContent,
      ),
    ).toEqual([
      "Bash",
      "CSS",
      "HTML",
      "JavaScript",
      "JSON",
      "Markdown",
      "Python",
      "SQL",
      "TypeScript",
      "YAML",
      "Barre de blocs d'un bloc code : aide et mention",
    ]);
  });

  it("F-033-AC14 un rôle que la page ne porte nulle part est nommé", () => {
    const { container } = render(
      <CodeColore
        portions={[
          { texte: "def", role: "motCle" },
          { texte: " f(): " },
          { texte: '"x"', role: "chaine" },
        ]}
      />,
    );

    expect(rolesAbsents(container)).toEqual([
      "nombre",
      "commentaire",
      "fonction",
      "type",
      "propriete",
    ]);
  });

  it("F-004-AC50 elle montre chaque jeton de couleur, chaque dégradé et chaque taille de texte", () => {
    render(<PageDemonstration jetons={jetons} />);
    const { theme } = lireJetons(jetons);
    const montres = theme.filter(({ nom }) => /^--(color|degrade)-/.test(nom));
    expect(montres.length).toBeGreaterThanOrEqual(20);
    for (const { nom } of montres) {
      expect(screen.queryByText(nom.replace(/^--(color-)?/, "")), nom).not.toBeNull();
    }
    const echelle = screen.getByRole("heading", { name: "Échelle typographique" }).parentElement;
    const tailles = theme.filter(
      ({ nom }) => /^--text-[a-z-]+$/.test(nom) && !nom.slice(2).includes("--"),
    );
    expect(within(echelle as HTMLElement).getAllByRole("listitem")).toHaveLength(tailles.length);
  });
});

const ENTREE_DE_LA_PAGE = "src/demonstration/entree.tsx";
const IMPORT_DYNAMIQUE = "test/fixtures/import-dynamique";

/** F-004-AC50 : le gabarit de production ne charge que son entrée, et rien hors de la page ne la nomme. */
function fautesDeProduction(gabarit: string, fichiers: ReadonlyMap<string, string>): string[] {
  const entrees = gabarit.match(/<script[^>]*>/g) ?? [];
  return [
    ...(entrees.length === 1 && entrees[0] === '<script type="module" src="/src/main.tsx">'
      ? []
      : [`index.html : entrées chargées : ${entrees.join(", ")}`]),
    ...(/demo/.test(gabarit) ? ["index.html : cite la page de démonstration"] : []),
    ...[...fichiers]
      .filter(
        ([chemin, texte]) =>
          !chemin.startsWith("src/demonstration/") && /demonstration\//.test(texte),
      )
      .map(([chemin]) => `${chemin} : nomme un fichier de la page de démonstration`),
  ];
}

/** F-004-AC50 : la page vit de données fictives, sans document Yjs, session ni persistance. */
function fautesDeDonneesReelles(
  atteints: readonly string[],
  fichiers: ReadonlyMap<string, string>,
): string[] {
  return [
    ...atteints
      .filter((chemin) => /^src\/(espace|persistance|navigation)\//.test(chemin))
      .map((chemin) => `${chemin} : atteint depuis la page de démonstration`),
    ...atteints.flatMap((chemin) => {
      const importe = /from "(yjs|y-indexeddb)"/.exec(fichiers.get(chemin) ?? "");
      return importe === null ? [] : [`${chemin} : importe ${importe[1]}, atteint depuis la page`];
    }),
    ...dansLaDemonstration(fichiers.keys())
      .filter((chemin) => /@notionlike\/document/.test(fichiers.get(chemin) ?? ""))
      .map((chemin) => `${chemin} : importe le document d'espace`),
  ];
}

const STRUCTURE_DE_LA_COQUILLE =
  /\b(?:fixed|shadow-voile|w-barre|w-tiroir|filet-droit|plan-(?:voile|tiroir))\b/;

/** Textes que l'interface déclare en constantes ; le nom de l'application est une donnée de la page. */
function textesDeLInterface(messages: string): string[] {
  return [...messages.matchAll(/^(?:export )?const [A-Z_]+ =\s*"([^"]+)";/gm)]
    .map(([, texte = ""]) => texte)
    .filter((texte) => texte !== "notionLike");
}

/** F-004-AC50 : la page rend la coquille et les textes de l'interface, elle ne les recopie pas. */
function fautesDeRecopie(page: ReadonlyMap<string, string>, messages: string): string[] {
  const textes = textesDeLInterface(messages);
  return [...page].flatMap(([chemin, source]) => {
    const structure = /\.classes\.ts$/.test(chemin) ? STRUCTURE_DE_LA_COQUILLE.exec(source) : null;
    return [
      ...(structure === null
        ? []
        : [`${chemin} : recopie la structure de la coquille : ${structure[0]}`]),
      ...textes
        .filter((texte) => source.includes(`"${texte}"`))
        .map((texte) => `${chemin} : recopie le texte « ${texte} »`),
      ...(/touches=\{\[|touches: \[/.test(source)
        ? [`${chemin} : écrit une combinaison de touches`]
        : []),
    ];
  });
}

describe("page de démonstration : hors de la production", () => {
  it("F-004-AC50 d'après le graphe de dependency-cruiser, rien d'atteint depuis l'entrée de production n'importe la page, son code ni la feuille de démonstration", async () => {
    const aretes = await graphe();
    const atteints = atteintsDepuis(aretes, ENTREE_DE_PRODUCTION);
    expect(atteints.has("src/interface/Application.tsx")).toBe(true);
    expect(atteints.has("src/interface/composants/Coquille.tsx")).toBe(true);
    expect(dansLaDemonstration(atteints)).toEqual([]);
    expect(atteints.has(FEUILLE_D_ENTREE)).toBe(true);
    expect(atteints.has(FEUILLE_DE_DEMONSTRATION)).toBe(false);
    expect(atteintsDepuis(aretes, ENTREE_DE_LA_PAGE).has(FEUILLE_DE_DEMONSTRATION)).toBe(true);
    expect(fautesDeProduction(lire("index.html"), sources)).toEqual([]);
  });

  it("F-004-AC53 F-004-AC50 un gabarit de production qui charge une autre entrée ou cite la démonstration, et un module hors de la page qui la nomme, sont nommés", () => {
    const gabarit = '<div id="root"></div><script type="module" src="/src/main.tsx"></script>';
    const conforme = new Map([
      ["src/main.tsx", 'import { Application } from "./interface/Application.tsx";'],
      ["src/demonstration/entree.tsx", 'import "./demonstration.css";'],
    ]);
    expect(fautesDeProduction(gabarit, conforme)).toEqual([]);
    expect(
      fautesDeProduction(
        gabarit.replace("/src/main.tsx", "/src/demonstration/entree.tsx"),
        conforme,
      ),
    ).toEqual([
      'index.html : entrées chargées : <script type="module" src="/src/demonstration/entree.tsx">',
      "index.html : cite la page de démonstration",
    ]);
    expect(fautesDeProduction(`${gabarit}<a href="/demo.html">Démo</a>`, conforme)).toEqual([
      "index.html : cite la page de démonstration",
    ]);
    expect(
      fautesDeProduction(
        gabarit,
        new Map([...conforme, ["src/interface/A.tsx", 'import("../demonstration/Page.tsx");']]),
      ),
    ).toEqual(["src/interface/A.tsx : nomme un fichier de la page de démonstration"]);
  });

  it("F-004-AC53 F-004-AC50 un import de la page depuis la production est détecté, même indirect", () => {
    const fautif: Aretes = new Map([
      ["src/main.tsx", ["src/interface/A.tsx"]],
      ["src/interface/A.tsx", ["src/demonstration/Page.tsx"]],
      ["src/demonstration/Page.tsx", ["src/demonstration/donnees.ts", FEUILLE_DE_DEMONSTRATION]],
      ["src/demonstration/donnees.ts", []],
    ]);
    expect(dansLaDemonstration(atteintsDepuis(fautif, "src/main.tsx"))).toEqual([
      "src/demonstration/Page.tsx",
      "src/demonstration/donnees.ts",
      FEUILLE_DE_DEMONSTRATION,
    ]);
    const conforme: Aretes = new Map([...fautif, ["src/interface/A.tsx", []]]);
    expect(dansLaDemonstration(atteintsDepuis(conforme, "src/main.tsx"))).toEqual([]);
  });

  it("F-004-AC53 F-004-AC50 le graphe voit un module atteint par un seul import dynamique", async () => {
    const atteints = atteintsDepuis(await graphe(), `${IMPORT_DYNAMIQUE}/entree.ts`);
    expect(lire(`${IMPORT_DYNAMIQUE}/entree.ts`)).toMatch(/return import\("\.\/atteint\.ts"\);/);
    expect(lire(`${IMPORT_DYNAMIQUE}/entree.ts`)).not.toMatch(/\bfrom\b/);
    expect([...atteints].sort()).toEqual([
      `${IMPORT_DYNAMIQUE}/atteint.ts`,
      `${IMPORT_DYNAMIQUE}/entree.ts`,
    ]);
  });

  it("F-004-AC50 la page vit sous src/, sans document Yjs, session ni persistance, et rend la coquille de l'application", async () => {
    const aretes = await graphe();
    const atteints = [...atteintsDepuis(aretes, ENTREE_DE_LA_PAGE)].filter((chemin) =>
      chemin.startsWith("src/"),
    );
    expect(dansLaDemonstration(atteints).length).toBeGreaterThanOrEqual(5);
    expect(atteints).toContain("src/interface/composants/Coquille.tsx");
    expect(fautesDeDonneesReelles(atteints, sources)).toEqual([]);
    expect(lire("demo.html")).toContain('src="/src/demonstration/entree.tsx"');
  });

  it("F-004-AC53 F-004-AC50 une page de démonstration qui atteint la session, la persistance ou la navigation, ou qui importe Yjs ou le document, est nommée", () => {
    const conforme = new Map([
      [
        "src/demonstration/Page.tsx",
        'import { Rangee } from "../interface/composants/Rangee.tsx";',
      ],
      ["src/interface/composants/Rangee.tsx", 'import { useId } from "react";'],
    ]);
    const atteints = [...conforme.keys()];
    expect(fautesDeDonneesReelles(atteints, conforme)).toEqual([]);
    expect(fautesDeDonneesReelles([...atteints, "src/espace/session-espace.ts"], conforme)).toEqual(
      ["src/espace/session-espace.ts : atteint depuis la page de démonstration"],
    );
    expect(
      fautesDeDonneesReelles([...atteints, "src/persistance/indexeddb.ts"], conforme),
    ).toHaveLength(1);
    expect(
      fautesDeDonneesReelles(
        atteints,
        new Map([
          ...conforme,
          ["src/interface/composants/Rangee.tsx", 'import * as Y from "yjs";'],
        ]),
      ),
    ).toEqual(["src/interface/composants/Rangee.tsx : importe yjs, atteint depuis la page"]);
    expect(
      fautesDeDonneesReelles(
        atteints,
        new Map([
          ...conforme,
          ["src/demonstration/Page.tsx", 'import type { PageLue } from "@notionlike/document";'],
        ]),
      ),
    ).toEqual(["src/demonstration/Page.tsx : importe le document d'espace"]);
  });

  it("F-004-AC50 la page ne recopie ni la structure de la coquille, ni un texte de l'interface, ni une combinaison de touches", () => {
    const page = new Map(
      dansLaDemonstration(sources.keys()).map((chemin) => [chemin, sources.get(chemin) ?? ""]),
    );
    expect(textesDeLInterface(lire("src/interface/messages.ts")).length).toBeGreaterThanOrEqual(20);
    expect(fautesDeRecopie(page, lire("src/interface/messages.ts"))).toEqual([]);
    expect(lire(PAGE)).toContain("afficherTouches(RACCOURCIS.renommer)");
  });

  it("F-004-AC53 F-004-AC50 une page qui recopie une classe de structure de la coquille, un texte de l'interface ou une combinaison de touches est nommée", () => {
    const messages =
      'export const NOM_APPLICATION = "notionLike";\nexport const NOUVELLE_PAGE = "Nouvelle page";';
    const conforme = new Map([
      ["src/demonstration/page.classes.ts", 'export const PAGE = { apercu: "relative flex" };'],
      ["src/demonstration/Page.tsx", "<Tete nom={NOM_APPLICATION} libelle={NOUVELLE_PAGE} />"],
      ["src/demonstration/donnees.ts", 'export const NOM = "notionLike";'],
    ]);
    expect(fautesDeRecopie(conforme, messages)).toEqual([]);
    const avec = (chemin: string, texte: string): string[] =>
      fautesDeRecopie(new Map([...conforme, [chemin, texte]]), messages);
    expect(
      avec("src/demonstration/page.classes.ts", 'export const PAGE = { tiroir: "fixed" };'),
    ).toEqual(["src/demonstration/page.classes.ts : recopie la structure de la coquille : fixed"]);
    expect(avec("src/demonstration/Page.tsx", '<Tete libelle="Nouvelle page" />')).toEqual([
      "src/demonstration/Page.tsx : recopie le texte « Nouvelle page »",
    ]);
    expect(avec("src/demonstration/Page.tsx", '<Raccourci touches={["F2"]} />')).toEqual([
      "src/demonstration/Page.tsx : écrit une combinaison de touches",
    ]);
  });
});

// Écrans de référence de la spec pour cette feature : la lettre (f) lui est retirée (F-003).
const LETTRES_DE_REFERENCE = ["a", "b", "c", "d", "e", "g", "h", "i", "j"];

/** Couples (écran, largeur) que la liste doit porter et qu'elle ne porte pas, ou porte en trop. */
function ecartsDeLaListe(
  ecrans: Readonly<Record<string, string>>,
  captures: readonly CaptureAttendue[],
): string[] {
  const attendues = [
    ...LARGEURS_DE_CAPTURE.map((largeur) => `demonstration-${largeur}`),
    ...LETTRES_DE_REFERENCE.flatMap((lettre) =>
      LARGEURS_DE_CAPTURE.filter((largeur) => lettre !== "j" || largeur < 1024).map(
        (largeur) => `${ecrans[lettre] ?? `(${lettre}) sans nom`}-${largeur}`,
      ),
    ),
  ];
  const portees = captures.map(({ ecran, largeur }) => `${ecran}-${largeur}`);
  return [
    ...attendues.filter((nom) => !portees.includes(nom)).map((nom) => `manque : ${nom}`),
    ...portees.filter((nom) => !attendues.includes(nom)).map((nom) => `en trop : ${nom}`),
  ];
}

const SCENARIOS_DE_CAPTURE = ["e2e/demonstration.spec.ts", "e2e/captures.spec.ts"];

/** F-004-AC51 : un scénario de capture lit la liste unique, capture comme prescrit, et vérifie. */
function fautesDeScenarioDeCapture(chemin: string, scenario: string): string[] {
  const exigences: readonly (readonly [boolean, string])[] = [
    [
      /import \{[^}]*CAPTURES_ATTENDUES[^}]*\} from "\.\/captures-attendues\.ts";/.test(scenario),
      "n'importe pas la liste des captures attendues",
    ],
    [!/\.png/.test(scenario), "écrit un nom de capture au lieu de le lire dans la liste"],
    [
      /fullPage: true,\s*animations: "disabled",\s*caret: "hide"/.test(scenario),
      "capture sans fullPage, animations désactivées et curseur masqué",
    ],
    [
      /existsSync\(chemin\)[^;]*\.toBe\(true\)/.test(scenario),
      "ne vérifie pas que chaque capture attendue existe",
    ],
    [
      /statSync\(chemin\)\.size[^;]*\.toBeGreaterThan\(0\)/.test(scenario),
      "ne vérifie pas qu'aucune capture n'est vide",
    ],
  ];
  return exigences.filter(([tenue]) => !tenue).map(([, faute]) => `${chemin} : ${faute}`);
}

describe("captures de référence", () => {
  it("F-004-AC51 la liste attendue couvre la page de démonstration et chaque écran de référence à chaque largeur qui lui revient, le tiroir aux seules largeurs étroites", () => {
    expect(LARGEURS_DE_CAPTURE).toEqual([360, 768, 1280]);
    expect(Object.keys(ECRANS_DE_REFERENCE)).toEqual(LETTRES_DE_REFERENCE);
    expect(ecartsDeLaListe(ECRANS_DE_REFERENCE, CAPTURES_ATTENDUES)).toEqual([]);
    expect(CAPTURES_ATTENDUES).toHaveLength(29);
    expect(
      CAPTURES_ATTENDUES.filter(({ ecran }) => ecran === "demonstration").map(nomDeCapture),
    ).toEqual(["demonstration-360.png", "demonstration-768.png", "demonstration-1280.png"]);
    expect(
      CAPTURES_ATTENDUES.filter(({ ecran }) => ecran === "j-tiroir").map(nomDeCapture),
    ).toEqual(["j-tiroir-360.png", "j-tiroir-768.png"]);
    expect(new Set(CAPTURES_ATTENDUES.map(nomDeCapture)).size).toBe(CAPTURES_ATTENDUES.length);
    for (const capture of CAPTURES_ATTENDUES) {
      expect(nomDeCapture(capture)).toMatch(/^[a-z][a-z-]*-(360|768|1280)\.png$/);
    }
  });

  it("F-004-AC53 F-004-AC51 un écran de référence oublié, une largeur manquante ou le tiroir sur écran large sont nommés", () => {
    const conforme = [...CAPTURES_ATTENDUES];
    expect(ecartsDeLaListe(ECRANS_DE_REFERENCE, conforme)).toEqual([]);
    expect(
      ecartsDeLaListe(
        ECRANS_DE_REFERENCE,
        conforme.filter(({ ecran }) => ecran !== "h-echec-de-persistance"),
      ),
    ).toEqual([
      "manque : h-echec-de-persistance-360",
      "manque : h-echec-de-persistance-768",
      "manque : h-echec-de-persistance-1280",
    ]);
    expect(
      ecartsDeLaListe(
        ECRANS_DE_REFERENCE,
        conforme.filter(({ ecran, largeur }) => ecran !== "c-arborescence" || largeur !== 768),
      ),
    ).toEqual(["manque : c-arborescence-768"]);
    expect(
      ecartsDeLaListe(ECRANS_DE_REFERENCE, [...conforme, { ecran: "j-tiroir", largeur: 1280 }]),
    ).toEqual(["en trop : j-tiroir-1280"]);
    const sansG = Object.fromEntries(
      Object.entries(ECRANS_DE_REFERENCE).filter(([lettre]) => lettre !== "g"),
    );
    expect(ecartsDeLaListe(sansG, conforme)).toHaveLength(6);
  });

  it("F-004-AC51 le dossier des captures est celui que git ignore, et les deux scénarios de capture lisent cette liste", () => {
    expect(DOSSIER_DES_CAPTURES).toBe("test-results/captures");
    for (const chemin of SCENARIOS_DE_CAPTURE) {
      expect(fautesDeScenarioDeCapture(chemin, lire(chemin))).toEqual([]);
    }
    expect(lire("e2e/captures.spec.ts")).toMatch(/ecran !== PAGE_DE_DEMONSTRATION/);
    expect(lire("e2e/demonstration.spec.ts")).toMatch(/ecran === PAGE_DE_DEMONSTRATION/);
  });

  it("F-004-AC53 F-004-AC51 un scénario de capture qui ne lit pas la liste, écrit un nom de fichier, capture sans les trois options ou ne vérifie pas ses captures est nommé", () => {
    const conforme = [
      'import { CAPTURES_ATTENDUES, nomDeCapture } from "./captures-attendues.ts";',
      'await page.screenshot({ path, fullPage: true, animations: "disabled", caret: "hide" });',
      "expect(existsSync(chemin), chemin).toBe(true);",
      "expect(statSync(chemin).size, chemin).toBeGreaterThan(0);",
    ].join("\n");
    const fautes = (avant: string, apres: string): string[] => {
      expect(conforme).toContain(avant);
      return fautesDeScenarioDeCapture("e2e/x.spec.ts", conforme.replace(avant, apres));
    };
    expect(fautesDeScenarioDeCapture("e2e/x.spec.ts", conforme)).toEqual([]);
    expect(fautes("CAPTURES_ATTENDUES, ", "")).toEqual([
      "e2e/x.spec.ts : n'importe pas la liste des captures attendues",
    ]);
    expect(fautes("path,", 'path: "a-accueil-360.png",')).toEqual([
      "e2e/x.spec.ts : écrit un nom de capture au lieu de le lire dans la liste",
    ]);
    expect(fautes(' caret: "hide"', "")).toEqual([
      "e2e/x.spec.ts : capture sans fullPage, animations désactivées et curseur masqué",
    ]);
    expect(fautes("expect(existsSync(chemin), chemin).toBe(true);", "")).toEqual([
      "e2e/x.spec.ts : ne vérifie pas que chaque capture attendue existe",
    ]);
    expect(fautes(".toBeGreaterThan(0)", ".toBeDefined()")).toEqual([
      "e2e/x.spec.ts : ne vérifie pas qu'aucune capture n'est vide",
    ]);
  });
});
