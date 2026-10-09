// Seuil étroit et tiroir de la barre latérale (F-004-AC41, AC42), sous jsdom : attributs posés et
// retirés, gestionnaires écrits par le projet. L'inertie réelle, le focus au fil des tabulations et
// les dimensions ne se prouvent que dans un navigateur (e2e/largeurs.spec.ts).
import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { lire, lister } from "./aides-disque.ts";
import { type Coquille, ouvrirCoquille, recevoir } from "./aides-coquille.tsx";
import { seuilEtroit, seuilEtroitEnPixels, simulerLaLargeur } from "./aides-largeur.ts";

const OUVRIR = "Ouvrir la barre latérale";
const FERMER = "Fermer la barre latérale";
const ETROIT = 360;
const LARGE = 1280;

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

async function ouvrirAvecDeuxPages(): Promise<Coquille> {
  const coquille = await ouvrirCoquille();
  recevoir(coquille.session, (espace) => {
    espace.creerPage("Alpha");
    espace.creerPage("Bêta");
  });
  return coquille;
}

async function ouvrirLeTiroir(coquille: Coquille): Promise<void> {
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

  it("F-004-AC41 seul le module de largeur interroge la fenêtre, et aucun fichier de src/ n'écrit la valeur du seuil", () => {
    const sources = lister("src").filter((chemin) => /\.tsx?$/.test(chemin));
    expect(
      sources.filter((chemin) => /matchMedia|innerWidth|ResizeObserver/.test(lire(chemin))),
    ).toEqual(["src/interface/largeur.ts"]);
    const largeur = lire("src/interface/largeur.ts");
    expect(largeur).toContain('"--breakpoint-etroit"');
    expect(largeur).toContain("getComputedStyle(document.documentElement)");
    for (const chemin of sources) {
      expect(lire(chemin), chemin).not.toMatch(/51\.25|\b820\b/);
    }
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
    expect(screen.queryByRole("textbox")).toBeNull();
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
