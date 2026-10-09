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
import { ENTREE_DE_PIED_FICTIVE, PAGE_COURANTE, TITRE_LONG } from "../src/demonstration/donnees.ts";
import { MARQUEUR_DE_DEMONSTRATION } from "../src/demonstration/marqueur.ts";
import { PageDemonstration } from "../src/demonstration/PageDemonstration.tsx";
import { BARRE } from "../src/interface/composants/barre.classes.ts";
import { messageErreur } from "../src/interface/messages.ts";
import { lireJetons } from "../src/styles/lecture-jetons.ts";
import { lire, lireDossier } from "./aides-disque.ts";
import { type Aretes, atteintsDepuis, graphe } from "./aides-graphe.ts";
import { FEUILLE_D_ENTREE, FEUILLE_DE_DEMONSTRATION } from "./aides-styles.ts";

const sources = lireDossier("src");
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

/** Les états que F-004-AC50 nomme, et ce qui prouve que la page rend chacun. */
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
    alertes(page).some((texte) => texte.startsWith("Vos modifications ne sont pas enregistrées")),
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
      "Avertissement",
      "BarreDuHaut",
      "BoutonIcone",
      "CadreDeBarre",
      "ChampTitre",
      "Chargement",
      "CheminDePage",
      "Coquille",
      "EcranBloquant",
      "EcranPlein",
      "EntetePage",
      "MenuActions",
      "Pictogramme",
      "Principale",
      "Raccourci",
      "Rangee",
      "Sceau",
      "TeteDeBarre",
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
    expect(Object.keys(ETATS_NOMMES)).toHaveLength(19);
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
      within(barre as HTMLElement).getByRole("button", { name: "Nouvelle page" }),
    ).toBeDefined();
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
  });

  it("F-004-AC40 F-004-AC50 la zone d'état s'y montre vide puis en échec, sans aucune affirmation", () => {
    const { container } = render(<PageDemonstration jetons={jetons} />);
    const zones = [...container.querySelectorAll("header [role='status']")].map(
      (zone) => zone.textContent,
    );
    expect(zones).toContain("");
    expect(zones.filter((texte) => texte !== "")).toEqual(["Non enregistré sur cet appareil"]);
    expect(container.textContent).not.toMatch(
      /Enregistré sur cet appareil|Modifications enregistrées/,
    );
  });

  it("F-004-AC50 elle montre chaque jeton de couleur, chaque dégradé et chaque taille de texte", () => {
    render(<PageDemonstration jetons={jetons} />);
    const { theme } = lireJetons(jetons);
    const montres = theme.filter(({ nom }) => /^--(color|degrade)-/.test(nom));
    expect(montres.length).toBeGreaterThanOrEqual(20);
    for (const { nom } of montres) {
      expect(screen.getByText(nom.replace(/^--(color-)?/, "")), nom).toBeDefined();
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
    expect(lire("index.html").match(/<script[^>]*>/g)).toEqual([
      '<script type="module" src="/src/main.tsx">',
    ]);
    expect(lire("index.html")).not.toMatch(/demo/);
    const importateurs = [...sources].filter(
      ([chemin, texte]) =>
        !chemin.startsWith("src/demonstration/") && /demonstration\//.test(texte),
    );
    expect(importateurs.map(([chemin]) => chemin)).toEqual([]);
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
    for (const chemin of atteints) {
      expect(chemin, chemin).not.toMatch(/^src\/(espace|persistance|navigation)\//);
      expect(sources.get(chemin) ?? "", chemin).not.toMatch(/from "(yjs|y-indexeddb)"/);
    }
    expect(lire("demo.html")).toContain('src="/src/demonstration/entree.tsx"');
    for (const chemin of dansLaDemonstration(sources.keys())) {
      expect(sources.get(chemin), chemin).not.toMatch(/@notionlike\/document/);
    }
  });

  it("F-004-AC50 la page ne recopie ni la structure de la coquille, ni un texte de l'interface, ni une combinaison de touches", () => {
    const classes = lire("src/demonstration/page.classes.ts");
    expect(classes).not.toMatch(
      /\b(?:fixed|shadow-voile|w-barre|w-tiroir|filet-droit|plan-(?:voile|tiroir))\b/,
    );
    const messages = lire("src/interface/messages.ts");
    const textes = [...messages.matchAll(/^(?:export )?const [A-Z_]+ =\s*"([^"]+)";/gm)].map(
      ([, texte = ""]) => texte,
    );
    expect(textes.length).toBeGreaterThanOrEqual(20);
    for (const chemin of dansLaDemonstration(sources.keys())) {
      const source = sources.get(chemin) ?? "";
      for (const texte of textes.filter((un) => un !== "notionLike")) {
        expect(source.includes(`"${texte}"`), `${chemin} recopie « ${texte} »`).toBe(false);
      }
      expect(source, chemin).not.toMatch(/touches=\{\[|touches: \[/);
    }
    expect(lire(PAGE)).toContain("afficherTouches(RACCOURCIS.renommer)");
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
    for (const chemin of ["e2e/demonstration.spec.ts", "e2e/captures.spec.ts"]) {
      const scenario = lire(chemin);
      expect(scenario, chemin).toMatch(
        /import \{[^}]*CAPTURES_ATTENDUES[^}]*\} from "\.\/captures-attendues\.ts";/,
      );
      expect(scenario, chemin).toMatch(/fullPage: true,\s*animations: "disabled",\s*caret: "hide"/);
      expect(scenario, chemin).not.toMatch(/\.png/);
      expect(scenario, chemin).toMatch(/existsSync\(chemin\)[^;]*\.toBe\(true\)/);
      expect(scenario, chemin).toMatch(/statSync\(chemin\)\.size[^;]*\.toBeGreaterThan\(0\)/);
    }
    expect(lire("e2e/captures.spec.ts")).toMatch(/ecran !== PAGE_DE_DEMONSTRATION/);
    expect(lire("e2e/demonstration.spec.ts")).toMatch(/ecran === PAGE_DE_DEMONSTRATION/);
  });
});
