// Seuil étroit et tiroir de la barre latérale (F-004-AC41, AC42), sous jsdom : attributs posés et
// retirés, gestionnaires écrits par le projet. L'inertie réelle, le focus au fil des tabulations et
// les dimensions ne se prouvent que dans un navigateur (e2e/largeurs.spec.ts).
import {
  act,
  createEvent,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Coquille } from "../src/interface/composants/Coquille.tsx";
import { Rangee, SELECTEUR_DU_LIEN_DE_PAGE } from "../src/interface/composants/Rangee.tsx";
import { useTiroir } from "../src/interface/tiroir.ts";
import { ouvrirCoquille, recevoir } from "./aides-coquille.tsx";
import { lire, lister } from "./aides-disque.ts";
import { seuilEtroit, seuilEtroitEnPixels, simulerLaLargeur } from "./aides-largeur.ts";

const OUVRIR = "Ouvrir la barre latérale";
const FERMER = "Fermer la barre latérale";
const ETROIT = 360;
const LARGE = 1280;

/** Ce que l'aide rend d'une application ouverte : sa session et son utilisateur simulé. */
type ApplicationOuverte = Awaited<ReturnType<typeof ouvrirCoquille>>;

afterEach(() => {
  document.documentElement.style.removeProperty("--breakpoint-etroit");
});

function boutonDOuverture(): HTMLElement {
  return screen.getByRole("button", { name: OUVRIR });
}

function barre(): HTMLElement {
  return screen.getByRole("navigation", { name: "Pages" });
}

/** Le conteneur de la barre latérale : celui que le bouton d'ouverture commande. */
function conteneurDeLaBarre(): HTMLElement {
  return barre().parentElement as HTMLElement;
}

function reste(): HTMLElement {
  return screen.getByRole("banner").parentElement as HTMLElement;
}

function voile(): Element | null {
  return document.querySelector("[data-voile]");
}

async function ouvrirAvecDeuxPages(): Promise<ApplicationOuverte> {
  const coquille = await ouvrirCoquille();
  recevoir(coquille.session, (espace) => {
    espace.creerPage("Alpha");
    espace.creerPage("Bêta");
  });
  return coquille;
}

async function ouvrirLeTiroir(coquille: ApplicationOuverte): Promise<void> {
  await coquille.utilisateur.click(boutonDOuverture());
  expect(conteneurDeLaBarre().getAttribute("role")).toBe("dialog");
}

function constaterLeTiroirFerme(): void {
  expect(conteneurDeLaBarre().hasAttribute("role")).toBe(false);
  expect(conteneurDeLaBarre().hasAttribute("aria-modal")).toBe(false);
  expect(reste().hasAttribute("inert")).toBe(false);
  expect(voile()).toBeNull();
  expect(screen.queryByRole("button", { name: FERMER })).toBeNull();
}

const MODULE_DE_LARGEUR = "src/interface/largeur.ts";
const INTERROGE_LA_FENETRE = /matchMedia|innerWidth|ResizeObserver/;
const PIXELS_PAR_REM = 16;

/**
 * F-004-AC41 : seul le module de largeur interroge la fenêtre, il tire sa valeur du jeton lu sur la
 * racine, et nul fichier n'écrit la valeur du seuil, en rem ou en pixels.
 */
function fautesDeLargeur(fichiers: ReadonlyMap<string, string>, seuil: string): string[] {
  const enRem = Number.parseFloat(seuil);
  const valeur = new RegExp(`${String(enRem).replace(".", "\\.")}|\\b${enRem * PIXELS_PAR_REM}\\b`);
  const fautes = [...fichiers].flatMap(([chemin, texte]) => {
    const interroge = chemin === MODULE_DE_LARGEUR ? null : INTERROGE_LA_FENETRE.exec(texte);
    const ecrite = valeur.exec(texte);
    return [
      ...(interroge === null
        ? []
        : [
            `${chemin} : interroge la largeur de la fenêtre hors du module de largeur : ${interroge[0]}`,
          ]),
      ...(ecrite === null ? [] : [`${chemin} : écrit la valeur du seuil étroit : ${ecrite[0]}`]),
    ];
  });
  const module = fichiers.get(MODULE_DE_LARGEUR) ?? "";
  const litLeJeton =
    module.includes('"--breakpoint-etroit"') &&
    module.includes("getComputedStyle(document.documentElement)");
  return litLeJeton
    ? fautes
    : [
        ...fautes,
        `${MODULE_DE_LARGEUR} : ne lit pas le jeton --breakpoint-etroit sur la racine du document`,
      ];
}

const TIROIR = "src/interface/tiroir.ts";

/** F-004-AC42 : le tiroir reconnaît le lien de page par le seul sélecteur que la rangée exporte. */
function fautesDeReconnaissance(tiroir: string): string[] {
  const fautes: string[] = [];
  if (!/import \{ SELECTEUR_DU_LIEN_DE_PAGE \} from "\.\/composants\/Rangee\.tsx";/.test(tiroir)) {
    fautes.push(`${TIROIR} : le sélecteur du lien de page n'est pas importé de la rangée`);
  }
  if (!/\.closest\(SELECTEUR_DU_LIEN_DE_PAGE\)/.test(tiroir)) {
    fautes.push(`${TIROIR} : le lien de page n'est pas cherché par le sélecteur de la rangée`);
  }
  const recherches = tiroir.match(/\.closest\(|querySelector|\.matches\(/g) ?? [];
  if (recherches.length !== 1 && fautes.length === 0) {
    fautes.push(
      `${TIROIR} : une seule recherche d'élément attendue, lue : ${recherches.join(", ")}`,
    );
  }
  const balisage = /a\[href\]|"li\b/.exec(tiroir);
  if (balisage !== null) {
    fautes.push(`${TIROIR} : balisage deviné : ${balisage[0]}`);
  }
  return fautes;
}

describe("seuil étroit", () => {
  it("F-004-AC41 le code interroge la largeur par une requête bâtie sur la valeur du jeton, lue sur la racine du document", async () => {
    const fenetre = simulerLaLargeur(LARGE);

    await ouvrirCoquille();

    expect(seuilEtroit()).toBe("51.25rem");
    expect(new Set(fenetre.requetes)).toEqual(new Set([`(width >= ${seuilEtroit()})`]));
  });

  it("F-004-AC41 de part et d'autre du seuil : tiroir un pixel en dessous, barre permanente au seuil", async () => {
    const fenetre = simulerLaLargeur(seuilEtroitEnPixels() - 1);
    await ouvrirCoquille();
    expect(boutonDOuverture()).toBeDefined();

    fenetre.changer(seuilEtroitEnPixels());
    expect(screen.queryByRole("button", { name: OUVRIR })).toBeNull();

    fenetre.changer(seuilEtroitEnPixels() - 1);
    expect(boutonDOuverture()).toBeDefined();
  });

  it("F-004-AC41 seul le module de largeur interroge la fenêtre, il lit le jeton sur la racine, et aucun fichier de src/ n'écrit la valeur du seuil", () => {
    const sources = new Map(
      lister("src")
        .filter((chemin) => /\.tsx?$/.test(chemin))
        .map((chemin) => [chemin, lire(chemin)]),
    );
    expect(sources.size).toBeGreaterThan(30);
    expect(fautesDeLargeur(sources, seuilEtroit())).toEqual([]);
  });

  it("F-004-AC53 F-004-AC41 un second module qui interroge la fenêtre, un seuil recopié en rem ou en pixels, et un module de largeur qui ne lit plus le jeton sont nommés", () => {
    const conforme = new Map([
      [
        MODULE_DE_LARGEUR,
        'const JETON = "--breakpoint-etroit";\ngetComputedStyle(document.documentElement).getPropertyValue(JETON);\nwindow.matchMedia(requete);',
      ],
      ["src/interface/A.tsx", "const etroit = useEcranEtroit();"],
    ]);
    expect(fautesDeLargeur(conforme, "51.25rem")).toEqual([]);
    const avec = (chemin: string, texte: string): string[] =>
      fautesDeLargeur(new Map([...conforme, [chemin, texte]]), "51.25rem");
    expect(avec("src/interface/B.tsx", "if (window.innerWidth < seuil) {}")).toEqual([
      "src/interface/B.tsx : interroge la largeur de la fenêtre hors du module de largeur : innerWidth",
    ]);
    expect(avec("src/interface/B.tsx", "new ResizeObserver(mesurer);")).toHaveLength(1);
    expect(avec("src/interface/B.tsx", 'const SEUIL = "51.25rem";')).toEqual([
      "src/interface/B.tsx : écrit la valeur du seuil étroit : 51.25",
    ]);
    expect(avec("src/interface/B.tsx", "const SEUIL_EN_PIXELS = 820;")).toEqual([
      "src/interface/B.tsx : écrit la valeur du seuil étroit : 820",
    ]);
    expect(avec(MODULE_DE_LARGEUR, 'window.matchMedia("(width >= " + seuil + ")");')).toEqual([
      `${MODULE_DE_LARGEUR} : ne lit pas le jeton --breakpoint-etroit sur la racine du document`,
    ]);
  });

  it("F-004-AC41 la requête est bâtie une seule fois par montage : ni les rendus suivants ni les changements de largeur ne la redemandent à la fenêtre", async () => {
    const fenetre = simulerLaLargeur(ETROIT);
    const coquille = await ouvrirAvecDeuxPages();
    await ouvrirLeTiroir(coquille);

    fenetre.changer(LARGE);
    expect(screen.queryByRole("button", { name: OUVRIR })).toBeNull();
    fenetre.changer(ETROIT);
    recevoir(coquille.session, (espace) => espace.creerPage("Gamma"));

    expect(boutonDOuverture()).toBeDefined();
    expect(fenetre.requetes).toEqual([`(width >= ${seuilEtroit()})`]);
  });

  it("F-004-AC41 tant que le jeton manque, la lecture est retentée : la requête est bâtie au premier rendu qui le trouve", async () => {
    const fenetre = simulerLaLargeur(ETROIT);
    document.documentElement.style.removeProperty("--breakpoint-etroit");
    const coquille = await ouvrirCoquille();
    expect(screen.queryByRole("button", { name: OUVRIR })).toBeNull();
    expect(fenetre.requetes).toEqual([]);

    document.documentElement.style.setProperty("--breakpoint-etroit", seuilEtroit());
    recevoir(coquille.session, (espace) => espace.creerPage("Alpha"));

    expect(boutonDOuverture()).toBeDefined();
    expect(fenetre.requetes).toHaveLength(1);
  });

  it("F-004-AC41 sans le jeton sur la racine (feuille non chargée), la barre reste permanente", async () => {
    await ouvrirCoquille();

    expect(screen.queryByRole("button", { name: OUVRIR })).toBeNull();
    constaterLeTiroirFerme();
  });
});

describe("tiroir sur écran étroit", () => {
  it("F-004-AC42 sur écran large, ni bouton d'ouverture ni voile, et la barre latérale n'est pas un dialogue", async () => {
    simulerLaLargeur(LARGE);

    await ouvrirAvecDeuxPages();

    expect(screen.queryByRole("button", { name: OUVRIR })).toBeNull();
    constaterLeTiroirFerme();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("F-004-AC42 sur écran étroit, au repos : un bouton « Ouvrir la barre latérale » dans la barre du haut, qui commande le conteneur de la barre", async () => {
    simulerLaLargeur(ETROIT);

    await ouvrirAvecDeuxPages();

    const bouton = boutonDOuverture();
    expect(screen.getByRole("banner").contains(bouton)).toBe(true);
    expect(bouton.getAttribute("aria-expanded")).toBe("false");
    expect(bouton.getAttribute("aria-controls")).toBe(conteneurDeLaBarre().id);
    expect(conteneurDeLaBarre().id).not.toBe("");
    constaterLeTiroirFerme();
  });

  it("F-004-AC42 F-004-AC15 ouvert : dialogue modal nommé, voile, reste inerte, focus sur « Fermer la barre latérale », aussitôt", async () => {
    simulerLaLargeur(ETROIT);
    const coquille = await ouvrirAvecDeuxPages();

    await ouvrirLeTiroir(coquille);

    const tiroir = screen.getByRole("dialog", { name: "Barre latérale" });
    expect(tiroir).toBe(conteneurDeLaBarre());
    expect(tiroir.getAttribute("aria-modal")).toBe("true");
    expect(reste().hasAttribute("inert")).toBe(true);
    expect(reste().contains(screen.getByRole("main"))).toBe(true);
    expect(tiroir.contains(reste())).toBe(false);
    expect(voile()).not.toBeNull();
    expect(tiroir.contains(voile())).toBe(false);
    expect(reste().contains(voile())).toBe(false);
    expect(boutonDOuverture().getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(within(tiroir).getByRole("button", { name: FERMER }));
    expect(tiroir.classList.contains("tiroir")).toBe(true);
    expect(voile()?.classList.contains("voile")).toBe(true);
  });

  it("F-004-AC42 Échap ferme le tiroir et rend le focus au bouton d'ouverture", async () => {
    simulerLaLargeur(ETROIT);
    const coquille = await ouvrirAvecDeuxPages();
    await ouvrirLeTiroir(coquille);

    await coquille.utilisateur.keyboard("{Escape}");

    constaterLeTiroirFerme();
    expect(document.activeElement).toBe(boutonDOuverture());
    expect(boutonDOuverture().getAttribute("aria-expanded")).toBe("false");
  });

  it("F-004-AC42 Échap ferme le tiroir quand le focus est sur body : il est écouté où que soit le focus, tant que le tiroir est ouvert", async () => {
    simulerLaLargeur(ETROIT);
    const coquille = await ouvrirAvecDeuxPages();
    await ouvrirLeTiroir(coquille);
    // Un clic sur une zone non focalisable du tiroir laisse le focus sur body.
    act(() => (document.activeElement as HTMLElement).blur());
    expect(document.activeElement).toBe(document.body);

    fireEvent.keyDown(document.body, { key: "Escape" });

    constaterLeTiroirFerme();
    expect(document.activeElement).toBe(boutonDOuverture());
  });

  it("F-004-AC42 tiroir fermé, Échap sur body ne fait rien : l'écoute cesse avec le tiroir, et sur écran large elle n'existe pas", async () => {
    const fenetre = simulerLaLargeur(ETROIT);
    const coquille = await ouvrirAvecDeuxPages();
    const posees = vi.spyOn(document, "addEventListener");
    const retirees = vi.spyOn(document, "removeEventListener");
    const deFrappe = (appels: readonly unknown[][]): unknown[] =>
      appels.filter(([type]) => type === "keydown").map(([, ecoute]) => ecoute);
    await ouvrirLeTiroir(coquille);
    expect(deFrappe(posees.mock.calls).length).toBeGreaterThan(0);
    await coquille.utilisateur.click(screen.getByRole("button", { name: FERMER }));
    constaterLeTiroirFerme();
    expect(deFrappe(retirees.mock.calls)).toEqual(deFrappe(posees.mock.calls));
    const lien = within(barre()).getByRole("link", { name: "Alpha" });

    for (const largeur of [ETROIT, LARGE]) {
      fenetre.changer(largeur);
      act(() => lien.focus());
      const frappe = createEvent.keyDown(document.body, { key: "Escape" });
      fireEvent(document.body, frappe);
      expect(frappe.defaultPrevented).toBe(false);
      constaterLeTiroirFerme();
      expect(document.activeElement).toBe(lien);
    }
  });

  it("F-004-AC42 Échap sur body, un menu du tiroir ouvert, ne ferme que le menu ; un second Échap ferme le tiroir", async () => {
    simulerLaLargeur(ETROIT);
    const coquille = await ouvrirAvecDeuxPages();
    await ouvrirLeTiroir(coquille);
    const actions = screen.getByRole("button", { name: "Actions de la page « Alpha »" });
    await coquille.utilisateur.click(actions);
    expect(screen.getByRole("menu")).toBeDefined();

    fireEvent.keyDown(document.body, { key: "Escape" });

    expect(screen.queryByRole("menu")).toBeNull();
    expect(conteneurDeLaBarre().getAttribute("role")).toBe("dialog");
    expect(document.activeElement).toBe(actions);

    fireEvent.keyDown(document.body, { key: "Escape" });
    constaterLeTiroirFerme();
    expect(document.activeElement).toBe(boutonDOuverture());
  });

  it("F-004-AC42 une autre touche qu'Échap, sur body ou dans le tiroir, le laisse ouvert", async () => {
    simulerLaLargeur(ETROIT);
    const coquille = await ouvrirAvecDeuxPages();
    await ouvrirLeTiroir(coquille);

    fireEvent.keyDown(document.body, { key: "Enter" });
    fireEvent.keyDown(screen.getByRole("button", { name: FERMER }), { key: "ArrowDown" });

    expect(conteneurDeLaBarre().getAttribute("role")).toBe("dialog");
    expect(reste().hasAttribute("inert")).toBe(true);
  });

  it("F-004-AC42 un clic sur le voile ferme le tiroir et rend le focus au bouton d'ouverture", async () => {
    simulerLaLargeur(ETROIT);
    const coquille = await ouvrirAvecDeuxPages();
    await ouvrirLeTiroir(coquille);

    await coquille.utilisateur.click(voile() as Element);

    constaterLeTiroirFerme();
    expect(document.activeElement).toBe(boutonDOuverture());
  });

  it("F-004-AC42 « Fermer la barre latérale » ferme le tiroir et rend le focus au bouton d'ouverture", async () => {
    simulerLaLargeur(ETROIT);
    const coquille = await ouvrirAvecDeuxPages();
    await ouvrirLeTiroir(coquille);

    await coquille.utilisateur.click(screen.getByRole("button", { name: FERMER }));

    constaterLeTiroirFerme();
    expect(document.activeElement).toBe(boutonDOuverture());
  });

  it("F-004-AC42 choisir une page ferme le tiroir et porte le focus dans la zone principale", async () => {
    simulerLaLargeur(ETROIT);
    const coquille = await ouvrirAvecDeuxPages();
    await ouvrirLeTiroir(coquille);

    await coquille.utilisateur.click(within(barre()).getByRole("link", { name: "Bêta" }));

    await waitFor(() => expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Bêta"));
    constaterLeTiroirFerme();
    expect(document.activeElement).toBe(screen.getByRole("main"));
  });

  it.each([
    ["Ctrl", { ctrlKey: true }],
    ["⌘", { metaKey: true }],
    ["Maj", { shiftKey: true }],
    ["Alt", { altKey: true }],
    ["le bouton du milieu", { button: 1 }],
  ])(
    "F-004-AC42 un clic avec %s sur le lien d'une rangée, qui l'ouvre ailleurs, ne ferme pas le tiroir et ne déplace pas le focus",
    async (_cas, clic) => {
      simulerLaLargeur(ETROIT);
      const coquille = await ouvrirAvecDeuxPages();
      await ouvrirLeTiroir(coquille);
      const fermeture = screen.getByRole("button", { name: FERMER });
      expect(document.activeElement).toBe(fermeture);

      fireEvent.click(within(barre()).getByRole("link", { name: "Bêta" }), clic);

      expect(conteneurDeLaBarre().getAttribute("role")).toBe("dialog");
      expect(reste().hasAttribute("inert")).toBe(true);
      expect(document.activeElement).toBe(fermeture);
    },
  );

  it("F-004-AC42 créer une page dans le tiroir le laisse ouvert, pour la saisie de son titre", async () => {
    simulerLaLargeur(ETROIT);
    const coquille = await ouvrirAvecDeuxPages();
    await ouvrirLeTiroir(coquille);

    await coquille.utilisateur.click(screen.getByRole("button", { name: "Nouvelle page" }));

    const champ = await screen.findByRole("textbox", { name: "Titre de la page" });
    expect(conteneurDeLaBarre().getAttribute("role")).toBe("dialog");
    expect(document.activeElement).toBe(champ);
    await coquille.utilisateur.keyboard("Gamma{Enter}");
    expect(await within(barre()).findByRole("link", { name: "Gamma" })).toBeDefined();
    expect(conteneurDeLaBarre().getAttribute("role")).toBe("dialog");

    // Échap dans la saisie annule la saisie, pas le tiroir.
    await coquille.utilisateur.click(screen.getByRole("button", { name: "Nouvelle page" }));
    await screen.findByRole("textbox", { name: "Titre de la page" });
    await coquille.utilisateur.keyboard("{Escape}");
    expect(screen.queryByRole("textbox", { name: "Titre de la page" })).toBeNull();
    expect(conteneurDeLaBarre().getAttribute("role")).toBe("dialog");
  });

  it("F-004-AC42 Échap dans un menu ouvert du tiroir ne ferme que le menu", async () => {
    simulerLaLargeur(ETROIT);
    const coquille = await ouvrirAvecDeuxPages();
    await ouvrirLeTiroir(coquille);
    await coquille.utilisateur.click(
      screen.getByRole("button", { name: "Actions de la page « Alpha »" }),
    );
    expect(screen.getByRole("menu")).toBeDefined();

    await coquille.utilisateur.keyboard("{Escape}");

    expect(screen.queryByRole("menu")).toBeNull();
    expect(conteneurDeLaBarre().getAttribute("role")).toBe("dialog");
  });

  it("F-004-AC42 la fenêtre repasse au-dessus du seuil, tiroir ouvert : barre permanente, sans voile ni reste inerte, et le tiroir ne se rouvre pas seul en repassant dessous", async () => {
    const fenetre = simulerLaLargeur(ETROIT);
    const coquille = await ouvrirAvecDeuxPages();
    await ouvrirLeTiroir(coquille);

    fenetre.changer(LARGE);

    constaterLeTiroirFerme();
    expect(screen.queryByRole("button", { name: OUVRIR })).toBeNull();
    expect(barre()).toBeDefined();

    fenetre.changer(ETROIT);
    constaterLeTiroirFerme();
    expect(boutonDOuverture().getAttribute("aria-expanded")).toBe("false");
  });
});

// Le tiroir et la rangée, sans l'application : une barre qui porte, à côté d'une rangée, un autre
// lien dans un élément de liste, comme une feature suivante pourrait en poser dans le pied.
function TiroirSeul(): ReactElement {
  const tiroir = useTiroir();
  const barreFictive = (
    <ul>
      <li>
        <a href="#/ailleurs">Autre lien de liste</a>
      </li>
      <Rangee
        niveau={1}
        titre="Page"
        adresse="#/page/a"
        courante={false}
        ajout={{ nom: "Ajouter", surActivation: vi.fn() }}
        actions={{ nom: "Actions", surActivation: vi.fn() }}
        menuOuvert={false}
      />
    </ul>
  );
  return (
    <Coquille
      tiroir={{ ouvert: tiroir.ouvert, nom: "Barre latérale", surClic: tiroir.surClic }}
      barre={barreFictive}
    >
      <button type="button" onClick={tiroir.ouvrir}>
        Ouvrir
      </button>
    </Coquille>
  );
}

describe("tiroir et rangée : le lien de page est désigné par la rangée", () => {
  it("F-004-AC42 seul le lien que la rangée désigne comme lien de page ferme le tiroir : un autre lien d'une liste de la barre le laisse ouvert", () => {
    simulerLaLargeur(ETROIT);
    render(<TiroirSeul />);
    fireEvent.click(screen.getByRole("button", { name: "Ouvrir" }));
    expect(screen.getByRole("dialog", { name: "Barre latérale" })).toBeDefined();
    // Échap vient avec le crochet lui-même : la coquille n'a aucun gestionnaire de frappe à recevoir.
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Ouvrir" }));
    expect(screen.getByRole("dialog", { name: "Barre latérale" })).toBeDefined();

    fireEvent.click(screen.getByRole("link", { name: "Autre lien de liste" }));
    expect(screen.queryByRole("dialog")).not.toBeNull();

    const lienDePage = screen.getByRole("link", { name: "Page" });
    expect(lienDePage.matches(SELECTEUR_DU_LIEN_DE_PAGE)).toBe(true);
    expect(document.querySelectorAll(SELECTEUR_DU_LIEN_DE_PAGE)).toHaveLength(1);
    fireEvent.click(lienDePage);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("F-004-AC42 le tiroir ne reconnaît le lien de page que par le sélecteur que la rangée exporte, jamais par son balisage", () => {
    expect(fautesDeReconnaissance(lire("src/interface/tiroir.ts"))).toEqual([]);
  });

  it("F-004-AC53 F-004-AC42 un tiroir qui devine le lien par son balisage, qui interroge le document, ou qui n'importe plus le sélecteur de la rangée est nommé", () => {
    const conforme =
      'import { SELECTEUR_DU_LIEN_DE_PAGE } from "./composants/Rangee.tsx";\nevenement.target.closest(SELECTEUR_DU_LIEN_DE_PAGE) !== null';
    expect(fautesDeReconnaissance(conforme)).toEqual([]);
    expect(
      fautesDeReconnaissance(conforme.replace("SELECTEUR_DU_LIEN_DE_PAGE)", '"a[href]")')),
    ).toEqual([
      "src/interface/tiroir.ts : le lien de page n'est pas cherché par le sélecteur de la rangée",
      "src/interface/tiroir.ts : balisage deviné : a[href]",
    ]);
    expect(
      fautesDeReconnaissance(`${conforme}\ndocument.querySelector("nav")?.matches(":hover");`),
    ).toEqual([
      "src/interface/tiroir.ts : une seule recherche d'élément attendue, lue : .closest(, querySelector, .matches(",
    ]);
    expect(fautesDeReconnaissance(conforme.split("\n")[1] ?? "")).toEqual([
      "src/interface/tiroir.ts : le sélecteur du lien de page n'est pas importé de la rangée",
    ]);
  });
});
