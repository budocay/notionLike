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
import { MARQUEUR_DE_DEMONSTRATION } from "../src/demonstration/marqueur.ts";
import { PageDemonstration } from "../src/demonstration/PageDemonstration.tsx";
import { lireJetons } from "../src/styles/lecture-jetons.ts";
import { lire, lireDossier } from "./aides-disque.ts";
import { type Aretes, atteintsDepuis, graphe } from "./aides-graphe.ts";

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
      "EntetePage",
      "MenuActions",
      "Pictogramme",
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

  it("F-004-AC50 elle porte son marqueur et rend chaque état sur des données fictives", () => {
    const { container } = render(<PageDemonstration jetons={jetons} />);
    expect(
      container.querySelector("[data-demonstration]")?.getAttribute("data-demonstration"),
    ).toBe(MARQUEUR_DE_DEMONSTRATION);
    expect(screen.getAllByRole("link", { current: "page" }).length).toBeGreaterThanOrEqual(3);
    expect(screen.getByRole("menu")).toBeDefined();
    expect(screen.getAllByRole("textbox", { name: "Titre de la page" })).toHaveLength(2);
    expect(container.querySelectorAll('input[aria-invalid="true"]')).toHaveLength(1);
    expect(
      screen.getAllByRole("navigation", { name: "Fil d'Ariane" }).length,
    ).toBeGreaterThanOrEqual(4);
    expect(screen.getByRole("button", { name: "Ouvrir la barre latérale" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Fermer la barre latérale" })).toBeDefined();
    expect(
      screen.getAllByRole("button", { name: "Afficher les pages intermédiaires" }).length,
    ).toBeGreaterThanOrEqual(1);
    for (const texte of ["Chargement…", "Page introuvable", "Mise à jour nécessaire"]) {
      expect(screen.getAllByText(texte).length, texte).toBeGreaterThanOrEqual(1);
    }
    expect(
      screen.getByText(/^Vos modifications ne sont pas enregistrées sur cet appareil/),
    ).toBeDefined();
    expect(container.querySelectorAll("[data-force]").length).toBeGreaterThanOrEqual(3);
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
  it("F-004-AC50 d'après le graphe de dependency-cruiser, rien d'atteint depuis l'entrée de production n'importe la page ni son code", async () => {
    const atteints = atteintsDepuis(await graphe(), ENTREE_DE_PRODUCTION);
    expect(atteints.has("src/interface/Application.tsx")).toBe(true);
    expect(atteints.has("src/interface/composants/Coquille.tsx")).toBe(true);
    expect(dansLaDemonstration(atteints)).toEqual([]);
    expect(lire("index.html").match(/<script[^>]*>/g)).toEqual([
      '<script type="module" src="/src/main.tsx">',
    ]);
    expect(lire("index.html")).not.toMatch(/demo/);
    const importateurs = [...sources].filter(
      ([chemin, texte]) =>
        !chemin.startsWith("src/demonstration/") && /demonstration\//.test(texte),
    );
    expect(importateurs.map(([chemin]) => chemin)).toEqual(["src/styles/entree.css"]);
  });

  it("F-004-AC53 F-004-AC50 un import de la page depuis la production est détecté, même indirect", () => {
    const fautif: Aretes = new Map([
      ["src/main.tsx", ["src/interface/A.tsx"]],
      ["src/interface/A.tsx", ["src/demonstration/Page.tsx"]],
      ["src/demonstration/Page.tsx", ["src/demonstration/donnees.ts"]],
      ["src/demonstration/donnees.ts", []],
    ]);
    expect(dansLaDemonstration(atteintsDepuis(fautif, "src/main.tsx"))).toEqual([
      "src/demonstration/Page.tsx",
      "src/demonstration/donnees.ts",
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
