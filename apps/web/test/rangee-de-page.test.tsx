// Barre latérale habillée par F-004, dans l'application réelle sous jsdom : rangée, menu « ⋯ »,
// renommage sur place, repère de page courante, tête et pied, raccourcis, structure accessible de
// l'arbre. Les styles, les dimensions et le survol ne se voient que dans un navigateur.
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { afficherTouches, RACCOURCIS } from "../src/interface/raccourcis.ts";
import {
  boutonDuMenu,
  type Coquille,
  creerPageNommee,
  ENTREES_DU_MENU,
  etatEncode,
  nomAjouterSousPage,
  nomDuMenu,
  nomDuRepli,
  ouvrirCoquille,
  recevoir,
} from "./aides-coquille.tsx";
import { lire, lister } from "./aides-disque.ts";
import {
  DECLARATION,
  fautesDeTouches,
  MODULE_DES_CLICS,
  TOUCHES_D_INTERACTION,
} from "./aides-touches.ts";

const CHAMP_TITRE = { name: "Titre de la page" };
const TITRE_DE_200 = "m".repeat(200);

function barre(): HTMLElement {
  return screen.getByRole("navigation", { name: "Pages" });
}

function lien(titre: string): HTMLElement {
  return within(barre()).getByRole("link", { name: titre });
}

function rangeeDe(titre: string): HTMLElement {
  return lien(titre).closest("li") as HTMLElement;
}

function titresDeLaBarre(): (string | null)[] {
  return within(barre())
    .queryAllByRole("link")
    .map((element) => element.textContent);
}

function nomDe(element: Element | null): string | null {
  return element?.getAttribute("aria-label") ?? element?.textContent ?? null;
}

/** Trois niveaux et une voisine, reçus d'une autre réplique : rien n'est sélectionné. */
async function ouvrirTroisNiveaux(): Promise<Coquille> {
  const coquille = await ouvrirCoquille();
  recevoir(coquille.session, (espace) => {
    const carnet = espace.creerPage("Carnet");
    const semaine = espace.creerPage("Semaine", { parent: carnet });
    espace.creerPage("Lundi", { parent: semaine });
    espace.creerPage("Voisine");
  });
  return coquille;
}

async function ouvrirLeMenu(coquille: Coquille, titre: string): Promise<HTMLElement> {
  await coquille.utilisateur.click(await boutonDuMenu(titre));
  return screen.getByRole("menu", { name: nomDuMenu(titre) });
}

/** Fait croire à jsdom, qui ne mesure rien, que le texte de l'élément déborde de sa boîte. */
function couper(element: HTMLElement, coupe: boolean): void {
  Object.defineProperty(element, "clientWidth", { configurable: true, value: 100 });
  Object.defineProperty(element, "scrollWidth", { configurable: true, value: coupe ? 400 : 100 });
}

describe("rangée : titre et actions", () => {
  it("F-004-AC24 le titre complet, même de 200 caractères, est le nom accessible du lien de la rangée", async () => {
    const { session } = await ouvrirCoquille();
    recevoir(session, (espace) => void espace.creerPage(TITRE_DE_200));

    expect(lien(TITRE_DE_200).textContent).toBe(TITRE_DE_200);
    expect(lien(TITRE_DE_200).getAttribute("title")).toBeNull();
  });

  it("F-004-AC24 un titre coupé s'affiche en entier dans une infobulle au survol et au focus clavier, hors de l'arbre d'accessibilité ; un titre entier n'en a pas", async () => {
    const { session, utilisateur } = await ouvrirCoquille();
    recevoir(session, (espace) => {
      espace.creerPage(TITRE_DE_200);
      espace.creerPage("Court");
    });
    const long = lien(TITRE_DE_200);
    couper(long, true);
    couper(lien("Court"), false);
    expect(barre().querySelector('[data-infobulle="titre"]')).toBeNull();

    await utilisateur.hover(long);

    const infobulle = rangeeDe(TITRE_DE_200).querySelector('[data-infobulle="titre"]');
    expect(infobulle?.textContent).toBe(TITRE_DE_200);
    expect(infobulle?.getAttribute("aria-hidden")).toBe("true");
    expect(long.getAttribute("aria-describedby")).toBeNull();
    await utilisateur.unhover(long);
    expect(barre().querySelector('[data-infobulle="titre"]')).toBeNull();

    act(() => long.focus());
    expect(rangeeDe(TITRE_DE_200).querySelector('[data-infobulle="titre"]')?.textContent).toBe(
      TITRE_DE_200,
    );
    act(() => lien("Court").focus());
    await utilisateur.hover(lien("Court"));
    expect(barre().querySelector('[data-infobulle="titre"]')).toBeNull();
  });

  it("F-004-AC25 au repos, une rangée ne porte que le repli, la sélection et deux boutons sans libellé, dans l'ordre de tabulation", async () => {
    const { utilisateur } = await ouvrirTroisNiveaux();

    const carnet = rangeeDe("Carnet");
    const boutons = within(carnet).getAllByRole("button");
    expect(boutons.map(nomDe)).toEqual([
      nomDuRepli("Carnet"),
      nomAjouterSousPage("Carnet"),
      nomDuMenu("Carnet"),
    ]);
    for (const bouton of boutons) {
      expect(bouton.textContent).toBe("");
      expect(bouton.tabIndex).toBe(0);
      expect(bouton.hasAttribute("hidden")).toBe(false);
      expect(bouton.closest("[aria-hidden]")).toBeNull();
    }
    expect(within(rangeeDe("Lundi")).getAllByRole("button").map(nomDe)).toEqual([
      nomAjouterSousPage("Lundi"),
      nomDuMenu("Lundi"),
    ]);
    expect(barre().textContent).not.toMatch(/Renommer|Sous-page|Corbeille/);

    act(() =>
      within(carnet)
        .getByRole("button", { name: nomDuRepli("Carnet") })
        .focus(),
    );
    const atteints: (string | null)[] = [];
    for (let pas = 0; pas < 3; pas += 1) {
      await utilisateur.tab();
      atteints.push(nomDe(document.activeElement));
    }
    expect(atteints).toEqual(["Carnet", nomAjouterSousPage("Carnet"), nomDuMenu("Carnet")]);
  });

  it("F-004-AC28 seule la rangée de la page courante porte aria-current et le repère non textuel", async () => {
    const { utilisateur } = await ouvrirTroisNiveaux();
    expect(barre().querySelector("li .fond-accent")).toBeNull();

    await utilisateur.click(lien("Semaine"));

    await waitFor(() => expect(lien("Semaine").getAttribute("aria-current")).toBe("page"));
    const courants = barre().querySelectorAll('[aria-current="page"]');
    expect(courants).toHaveLength(1);
    const reperes = barre().querySelectorAll("li .fond-accent");
    expect(reperes).toHaveLength(1);
    expect(reperes[0]?.closest("li")).toBe(rangeeDe("Semaine"));
    expect(reperes[0]?.getAttribute("aria-hidden")).toBe("true");
    expect(reperes[0]?.textContent).toBe("");

    await utilisateur.click(lien("Voisine"));

    await waitFor(() => expect(lien("Voisine").getAttribute("aria-current")).toBe("page"));
    expect(barre().querySelectorAll("li .fond-accent")).toHaveLength(1);
    expect(barre().querySelector("li .fond-accent")?.closest("li")).toBe(rangeeDe("Voisine"));
  });
});

describe("menu « ⋯ »", () => {
  it("F-004-AC26 F-004-AC15 « Actions de la page » ouvre un menu nommé d'après la page, trois entrées dans l'ordre, focus sur la première, aussitôt", async () => {
    const coquille = await ouvrirTroisNiveaux();
    const bouton = await boutonDuMenu("Carnet");
    expect(bouton.getAttribute("aria-haspopup")).toBe("menu");
    expect(bouton.getAttribute("aria-expanded")).toBe("false");

    const menu = await ouvrirLeMenu(coquille, "Carnet");

    expect(bouton.getAttribute("aria-expanded")).toBe("true");
    const entrees = within(menu).getAllByRole("menuitem");
    expect(entrees.map((entree) => entree.firstChild?.textContent)).toEqual(ENTREES_DU_MENU);
    for (const libelle of ENTREES_DU_MENU) {
      expect(within(menu).getByRole("menuitem", { name: libelle })).toBeDefined();
    }
    expect(document.activeElement).toBe(entrees[0]);
    expect(rangeeDe("Carnet").contains(menu)).toBe(true);
    expect(screen.getAllByRole("menu")).toHaveLength(1);
  });

  it("F-004-AC26 Flèche bas et Flèche haut parcourent les entrées, en boucle", async () => {
    const coquille = await ouvrirTroisNiveaux();
    const entrees = within(await ouvrirLeMenu(coquille, "Carnet")).getAllByRole("menuitem");
    const parcours: (string | null | undefined)[] = [];

    for (const touche of ["ArrowDown", "ArrowDown", "ArrowDown", "ArrowUp", "ArrowUp"]) {
      await coquille.utilisateur.keyboard(`{${touche}}`);
      parcours.push(document.activeElement?.firstChild?.textContent);
    }

    expect(parcours).toEqual([
      ENTREES_DU_MENU[1],
      ENTREES_DU_MENU[2],
      ENTREES_DU_MENU[0],
      ENTREES_DU_MENU[2],
      ENTREES_DU_MENU[1],
    ]);
    expect(entrees).toHaveLength(3);
  });

  it("F-004-AC26 Échap ferme le menu sans effet et rend le focus au bouton « ⋯ »", async () => {
    const coquille = await ouvrirTroisNiveaux();
    const avant = etatEncode(coquille.session);
    await ouvrirLeMenu(coquille, "Carnet");

    await coquille.utilisateur.keyboard("{ArrowDown}{ArrowDown}{Escape}");

    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(await boutonDuMenu("Carnet"));
    expect((await boutonDuMenu("Carnet")).getAttribute("aria-expanded")).toBe("false");
    expect(etatEncode(coquille.session)).toEqual(avant);
    expect(titresDeLaBarre()).toEqual(["Carnet", "Semaine", "Lundi", "Voisine"]);
  });

  it("F-004-AC26 un clic hors du menu le ferme, n'active pas ce qui est cliqué et rend le focus au bouton « ⋯ »", async () => {
    const coquille = await ouvrirTroisNiveaux();
    const avant = etatEncode(coquille.session);
    await ouvrirLeMenu(coquille, "Carnet");

    await coquille.utilisateur.click(lien("Voisine"));

    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(await boutonDuMenu("Carnet"));
    expect(window.location.hash).toBe("");
    expect(lien("Voisine").getAttribute("aria-current")).toBeNull();
    expect(etatEncode(coquille.session)).toEqual(avant);

    await coquille.utilisateur.click(lien("Voisine"));
    await waitFor(() => expect(lien("Voisine").getAttribute("aria-current")).toBe("page"));
  });

  it("F-004-AC26 seul le bouton principal enfoncé hors du menu est retenu : un clic droit ou du milieu garde son effet par défaut", async () => {
    const coquille = await ouvrirTroisNiveaux();
    await ouvrirLeMenu(coquille, "Carnet");

    // `fireEvent` rend faux quand l'effet par défaut a été empêché.
    expect(fireEvent.mouseDown(lien("Voisine"), { button: 2 })).toBe(true);
    expect(fireEvent.mouseDown(lien("Voisine"), { button: 1 })).toBe(true);
    expect(fireEvent.mouseDown(lien("Voisine"), { button: 0 })).toBe(false);
    expect(fireEvent.mouseDown(screen.getByRole("menu"), { button: 0 })).toBe(true);
    expect(screen.getByRole("menu", { name: nomDuMenu("Carnet") })).toBeDefined();
  });

  it.each([
    ["Ajouter une sous-page", "creerPage"],
    ["Mettre à la corbeille", "mettreALaCorbeille"],
  ] as const)(
    "F-004-AC26 « %s » refusée par le document : le menu se ferme comme pour « Renommer », le message s'affiche et le focus revient au bouton « ⋯ »",
    async (libelle, operation) => {
      const coquille = await ouvrirTroisNiveaux();
      const avant = etatEncode(coquille.session);
      const etat = coquille.session.lireEtat();
      if (etat.phase !== "pret") {
        throw new Error("La session n'est pas prête.");
      }
      vi.spyOn(etat.operations, operation).mockImplementation(() => {
        // Le refus réel du document pour une page qu'il ne connaît pas.
        etat.operations.renommerPage("5b6c7d8e-9f0a-4b1c-8d2e-3f4a5b6c7d8e", "Refus");
        throw new Error("Le document aurait dû refuser.");
      });
      const menu = await ouvrirLeMenu(coquille, "Voisine");

      await coquille.utilisateur.click(within(menu).getByRole("menuitem", { name: libelle }));

      expect(screen.getByRole("alert").textContent).toMatch(/^Cette page n'existe plus/);
      expect(screen.queryByRole("menu")).toBeNull();
      expect((await boutonDuMenu("Voisine")).getAttribute("aria-expanded")).toBe("false");
      expect(document.activeElement).toBe(await boutonDuMenu("Voisine"));
      expect(etatEncode(coquille.session)).toEqual(avant);
      expect(titresDeLaBarre()).toEqual(["Carnet", "Semaine", "Lundi", "Voisine"]);
    },
  );

  it("F-004-AC26 le bouton « ⋯ » referme son menu, et ouvrir le menu d'une autre page ferme le premier", async () => {
    const coquille = await ouvrirTroisNiveaux();
    await ouvrirLeMenu(coquille, "Carnet");

    await coquille.utilisateur.click(await boutonDuMenu("Carnet"));
    expect(screen.queryByRole("menu")).toBeNull();

    await ouvrirLeMenu(coquille, "Carnet");
    await coquille.utilisateur.click(await boutonDuMenu("Voisine"));
    expect(screen.queryByRole("menu")).toBeNull();
    await coquille.utilisateur.click(await boutonDuMenu("Voisine"));
    expect(screen.getByRole("menu", { name: nomDuMenu("Voisine") })).toBeDefined();
  });

  it("F-004-AC26 « Renommer », activée par Entrée, ouvre la saisie de F-002-AC6 dans la rangée", async () => {
    const coquille = await ouvrirTroisNiveaux();
    await ouvrirLeMenu(coquille, "Voisine");

    await coquille.utilisateur.keyboard("{Enter}");

    const champ = await screen.findByRole<HTMLInputElement>("textbox", CHAMP_TITRE);
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(champ);
    expect(champ.value).toBe("Voisine");
    await coquille.utilisateur.keyboard("Renommée{Enter}");
    expect(await within(barre()).findByRole("link", { name: "Renommée" })).toBeDefined();
    expect(titresDeLaBarre()).toEqual(["Carnet", "Semaine", "Lundi", "Renommée"]);
  });

  it("F-004-AC26 « Ajouter une sous-page », activée par Espace, crée la sous-page de F-002-AC5 et ouvre sa saisie", async () => {
    const coquille = await ouvrirTroisNiveaux();
    await ouvrirLeMenu(coquille, "Voisine");

    await coquille.utilisateur.keyboard("{ArrowDown} ");

    const champ = await screen.findByRole<HTMLInputElement>("textbox", CHAMP_TITRE);
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(champ);
    expect(champ.closest("li")?.getAttribute("aria-level")).toBe("2");
    await coquille.utilisateur.keyboard("Fille{Enter}");
    await waitFor(() =>
      expect(titresDeLaBarre()).toEqual(["Carnet", "Semaine", "Lundi", "Voisine", "Fille"]),
    );
  });

  it("F-004-AC26 « Mettre à la corbeille » retire la page et sa descendance, le focus va à « Nouvelle page » (F-002-AC7)", async () => {
    const coquille = await ouvrirTroisNiveaux();
    const menu = await ouvrirLeMenu(coquille, "Carnet");

    await coquille.utilisateur.click(
      within(menu).getByRole("menuitem", { name: "Mettre à la corbeille" }),
    );

    await waitFor(() => expect(titresDeLaBarre()).toEqual(["Voisine"]));
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Nouvelle page" }));
  });
});

describe("renommage sur place", () => {
  it("F-004-AC27 un double-clic sur le titre ouvre la saisie dans la rangée même, texte entier sélectionné", async () => {
    const { utilisateur } = await ouvrirTroisNiveaux();
    const rangee = rangeeDe("Semaine");

    await utilisateur.dblClick(lien("Semaine"));

    const champ = await screen.findByRole<HTMLInputElement>("textbox", CHAMP_TITRE);
    expect(rangee.contains(champ)).toBe(true);
    expect(within(rangee).queryByRole("link")).toBeNull();
    expect(champ.value).toBe("Semaine");
    expect([champ.selectionStart, champ.selectionEnd]).toEqual([0, "Semaine".length]);
    await utilisateur.keyboard("{Escape}");
    expect(await within(barre()).findByRole("link", { name: "Semaine" })).toBeDefined();
  });

  it.each([
    ["le lien", (): HTMLElement => lien("Carnet")],
    [
      "la commande de repli",
      (): HTMLElement => screen.getByRole("button", { name: nomDuRepli("Carnet") }),
    ],
    [
      "le bouton « ⋯ »",
      (): HTMLElement => screen.getByRole("button", { name: nomDuMenu("Carnet") }),
    ],
  ])(
    "F-004-AC27 F-004-AC31 F2, quand %s de la rangée a le focus, ouvre la saisie",
    async (_cas, cible) => {
      const { utilisateur } = await ouvrirTroisNiveaux();
      act(() => cible().focus());

      await utilisateur.keyboard(`{${RACCOURCIS.renommer.touche}}`);

      const champ = await screen.findByRole<HTMLInputElement>("textbox", CHAMP_TITRE);
      expect(champ.closest("li")?.getAttribute("aria-level")).toBe("1");
      expect(champ.value).toBe("Carnet");
      expect(document.activeElement).toBe(champ);
    },
  );

  it("F-004-AC27 F2 ne fait rien hors d'une rangée, ni pendant une saisie", async () => {
    const { session, utilisateur } = await ouvrirTroisNiveaux();
    const avant = etatEncode(session);

    act(() => screen.getByRole("button", { name: "Nouvelle page" }).focus());
    await utilisateur.keyboard("{F2}");
    fireEvent.keyDown(document.body, { key: "F2" });
    fireEvent.keyDown(screen.getByRole("main"), { key: "F2" });
    expect(screen.queryByRole("textbox")).toBeNull();

    await utilisateur.dblClick(lien("Voisine"));
    const champ = await screen.findByRole<HTMLInputElement>("textbox", CHAMP_TITRE);
    await utilisateur.keyboard("Autre{F2}");
    expect(screen.getAllByRole("textbox")).toEqual([champ]);
    expect(champ.value).toBe("Autre");
    expect(document.activeElement).toBe(champ);
    await utilisateur.keyboard("{Escape}");
    expect(etatEncode(session)).toEqual(avant);
  });

  it("F-004-AC27 la validation, l'annulation et le refus d'un titre trop long restent ceux de F-002-AC6 et AC14", async () => {
    const { session, utilisateur } = await ouvrirTroisNiveaux();
    await utilisateur.dblClick(lien("Voisine"));
    const champ = await screen.findByRole<HTMLInputElement>("textbox", CHAMP_TITRE);
    const avant = etatEncode(session);

    fireEvent.change(champ, { target: { value: "x".repeat(201) } });
    await utilisateur.keyboard("{Enter}");

    const alerte = await screen.findByRole("alert");
    expect(alerte.textContent).toContain("200");
    expect(champ.getAttribute("aria-invalid")).toBe("true");
    expect(document.getElementById(champ.getAttribute("aria-describedby") ?? "")).toBe(alerte);
    expect(etatEncode(session)).toEqual(avant);

    fireEvent.change(champ, { target: { value: "Validée" } });
    await utilisateur.keyboard("{Enter}");
    const valide = await within(barre()).findByRole("link", { name: "Validée" });
    expect(document.activeElement).toBe(valide);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("tête, pied et raccourcis", () => {
  it("F-004-AC29 la tête porte le sceau, sans texte, et « Nouvelle page » ; « Rechercher » n'y est pas, F-024 n'étant pas livrée", async () => {
    await ouvrirTroisNiveaux();

    const tete = barre().firstElementChild as HTMLElement;
    const sceau = tete.querySelector(".fond-accent");
    expect(sceau?.getAttribute("aria-hidden")).toBe("true");
    expect(sceau?.textContent).toBe("");
    expect(within(tete).getAllByRole("button").map(nomDe)).toEqual(["Nouvelle page"]);
    expect(within(tete).queryAllByRole("link")).toEqual([]);
    expect(barre().textContent).not.toContain("Rechercher");
    expect(lister("src").filter((chemin) => /palette|recherche/i.test(chemin))).toEqual([]);
  });

  it("F-004-AC30 le pied ne porte aucune entrée, F-007 n'étant pas livrée : la barre finit par l'arborescence, qui défile seule", async () => {
    await ouvrirTroisNiveaux();

    const zones = [...barre().children];
    expect(zones).toHaveLength(2);
    expect(zones[1]?.classList.contains("overflow-y-auto")).toBe(true);
    expect(zones[1]?.querySelectorAll("li")).toHaveLength(4);
    expect(zones[0]?.querySelector("li")).toBeNull();
    expect(barre().textContent).not.toContain("Corbeille");
    expect(lister("src").filter((chemin) => /corbeille/i.test(chemin))).toEqual([]);
  });

  it("F-004-AC31 la déclaration des raccourcis ne porte que F2 ; il agit dans sa portée et s'affiche dans un kbd à côté de « Renommer », exposé par aria-keyshortcuts sans entrer dans le nom", async () => {
    expect(Object.keys(RACCOURCIS)).toEqual(["renommer"]);
    expect(RACCOURCIS.renommer).toEqual({ touche: "F2", modificateurs: [] });
    const coquille = await ouvrirTroisNiveaux();

    const menu = await ouvrirLeMenu(coquille, "Voisine");

    const renommer = within(menu).getByRole("menuitem", { name: "Renommer" });
    expect(renommer.getAttribute("aria-keyshortcuts")).toBe("F2");
    const touches = renommer.querySelector("kbd");
    expect(touches?.textContent).toBe("F2");
    expect(touches?.getAttribute("aria-hidden")).toBe("true");
    for (const libelle of ENTREES_DU_MENU.slice(1)) {
      const entree = within(menu).getByRole("menuitem", { name: libelle });
      expect(entree.querySelector("kbd")).toBeNull();
      expect(entree.hasAttribute("aria-keyshortcuts")).toBe(false);
    }
    expect(barre().querySelectorAll("kbd kbd")).toHaveLength(1);

    await coquille.utilisateur.keyboard("{F2}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect((await screen.findByRole<HTMLInputElement>("textbox", CHAMP_TITRE)).value).toBe(
      "Voisine",
    );
  });

  it("F-004-AC31 une combinaison se rend selon la plateforme, Ctrl ou ⌘", () => {
    const combinaison = { touche: "K", modificateurs: ["Mod"] } as const;

    expect(afficherTouches(combinaison, "MacIntel")).toEqual(["⌘", "K"]);
    expect(afficherTouches(combinaison, "iPhone")).toEqual(["⌘", "K"]);
    expect(afficherTouches(combinaison, "Win32")).toEqual(["Ctrl", "K"]);
    expect(afficherTouches(combinaison, "Linux x86_64")).toEqual(["Ctrl", "K"]);
    expect(afficherTouches(RACCOURCIS.renommer, "MacIntel")).toEqual(["F2"]);
  });
});

describe("raccourcis : une seule source", () => {
  it("F-004-AC31 hors de la déclaration, aucun fichier de src/ ne compare une touche à un littéral, ne lit un modificateur de frappe ni n'écrit un nom de touche de raccourci ; les touches d'interaction sont celles de la liste fermée, toutes présentes dans le code", () => {
    const sources = new Map(
      lister("src")
        .filter((chemin) => /\.tsx?$/.test(chemin))
        .map((chemin) => [chemin, lire(chemin)]),
    );
    expect(sources.size).toBeGreaterThan(30);
    expect(fautesDeTouches(sources)).toEqual([]);
    expect(TOUCHES_D_INTERACTION).toEqual({
      "src/interface/SaisieTitre.tsx": ["Enter", "Escape"],
      "src/interface/composants/MenuActions.tsx": ["ArrowDown", "ArrowUp"],
      "src/interface/flottant.ts": ["Escape"],
      "src/interface/tiroir.ts": ["Escape"],
    });
    expect(lire(DECLARATION)).toContain('touche: "F2"');
    // Les modificateurs ne sont lus que par la déclaration, pour une frappe, et par le module des
    // clics, pour un clic.
    expect(
      [...sources].filter(([, texte]) => /ctrlKey|metaKey/.test(texte)).map(([chemin]) => chemin),
    ).toEqual([MODULE_DES_CLICS, DECLARATION]);
  });

  it("F-004-AC53 F-004-AC31 la déclaration, les touches d'interaction de la liste et le module des clics sont permis", () => {
    const admises = {
      "src/interface/A.tsx": ["Enter", "Escape"],
      "src/interface/B.tsx": ["ArrowUp"],
    };
    const conforme = new Map([
      [DECLARATION, 'export const R = { touche: "F2" };\nfrappe.ctrlKey && frappe.key === "k";'],
      [
        "src/interface/A.tsx",
        'const ECHAP = "Escape";\nif (evenement.key === "Enter" || ECHAP === evenement.key) {}\n<Raccourci touches={afficherTouches(RACCOURCIS.renommer)} />',
      ],
      [
        "src/interface/B.tsx",
        "const PAS: Record<string, number> = { ArrowUp: -1 };\nconst pas = PAS[evenement.key];",
      ],
      [MODULE_DES_CLICS, "return clic.button === 0 && !clic.ctrlKey && !clic.metaKey;"],
      ["src/espace/C.ts", 'if (erreur.code === "version-non-prise-en-charge") {}'],
    ]);
    expect(fautesDeTouches(conforme, admises)).toEqual([]);
  });

  it.each([
    [
      'if (evenement.key === "Delete") {}',
      ["src/interface/A.tsx : touche « Delete » comparée hors de la déclaration"],
    ],
    [
      'if (evenement.ctrlKey && evenement.key === "k") {}',
      [
        "src/interface/A.tsx : modificateur lu hors de la déclaration : ctrlKey",
        "src/interface/A.tsx : touche « k » comparée hors de la déclaration",
      ],
    ],
    [
      'if ("Delete" !== e.key) {}',
      ["src/interface/A.tsx : touche « Delete » comparée hors de la déclaration"],
    ],
    [
      'const SUPPR = "Delete";\nif (evenement.key === SUPPR) {}',
      ["src/interface/A.tsx : touche « Delete » comparée hors de la déclaration"],
    ],
    [
      'if (evenement.code === "KeyK") {}',
      ["src/interface/A.tsx : touche « KeyK » comparée hors de la déclaration"],
    ],
    [
      "const EFFETS = { Delete: jeter };\nEFFETS[evenement.key]?.();",
      ["src/interface/A.tsx : touche « Delete » comparée hors de la déclaration"],
    ],
    [
      'if (evenement.key === "Enter") {}',
      ["src/interface/A.tsx : touche « Enter » comparée hors de la déclaration"],
    ],
    [
      "if (evenement.key === TOUCHE_VENUE_D_AILLEURS) {}",
      [
        "src/interface/A.tsx : touche comparée à une valeur que le contrôle ne lit pas : evenement.key === TOUCHE_VENUE_D_AILLEURS",
      ],
    ],
    [
      'switch (evenement.key) { case "k": break; }',
      ["src/interface/A.tsx : touche lue hors d'une comparaison que le contrôle sait lire"],
    ],
    [
      "if (evenement.shiftKey) {}",
      ["src/interface/A.tsx : modificateur lu hors de la déclaration : shiftKey"],
    ],
    [
      'if (evenement.key === "F2") {}',
      expect.arrayContaining(['src/interface/A.tsx : touche en dur "F2"']),
    ],
    ['<Raccourci touches={["⌘", "K"]} />', ['src/interface/A.tsx : touche en dur "⌘"']],
    ['aria-keyshortcuts="Control+K"', ['src/interface/A.tsx : touche en dur "Control+K"']],
  ])("F-004-AC53 F-004-AC31 %s est refusé hors de la déclaration", (texte, fautes) => {
    expect(fautesDeTouches(new Map([["src/interface/A.tsx", texte]]), {})).toEqual(fautes);
  });

  it("F-004-AC53 F-004-AC31 une touche admise dans un autre fichier que le sien, un couple de la liste disparu du code et un clavier lu par le module des clics sont nommés", () => {
    const admises = { "src/interface/A.tsx": ["Enter", "Escape"] };
    const a = 'if (evenement.key === "Enter" || evenement.key === "Escape") {}';
    expect(fautesDeTouches(new Map([["src/interface/A.tsx", a]]), admises)).toEqual([]);
    expect(
      fautesDeTouches(
        new Map([
          ["src/interface/A.tsx", a],
          ["src/interface/B.tsx", 'if (evenement.key === "Escape") {}'],
        ]),
        admises,
      ),
    ).toEqual(["src/interface/B.tsx : touche « Escape » comparée hors de la déclaration"]);
    expect(
      fautesDeTouches(
        new Map([["src/interface/A.tsx", 'if (evenement.key === "Enter") {}']]),
        admises,
      ),
    ).toEqual([
      "liste des touches d'interaction : (Escape, src/interface/A.tsx) n'est plus dans le code",
    ]);
    expect(fautesDeTouches(new Map(), admises)).toHaveLength(2);
    expect(
      fautesDeTouches(
        new Map([[MODULE_DES_CLICS, 'return clic.key === "k" && clic.ctrlKey;']]),
        {},
      ),
    ).toEqual(["src/interface/clic.ts : le module des clics lit le clavier : .key"]);
    // Un commentaire qui cite une touche n'est pas une comparaison.
    expect(
      fautesDeTouches(
        new Map([["src/interface/C.tsx", '// evenement.key === "Delete"\nconst a = 1;']]),
        {},
      ),
    ).toEqual([]);
  });
});

describe("arbre : hiérarchie décrite, repli au nom stable, titre cité", () => {
  function description(titre: string): string | null {
    const cible = lien(titre).getAttribute("aria-describedby");
    return cible === null ? null : (document.getElementById(cible)?.textContent ?? null);
  }

  it("F-004-AC55 le lien d'une rangée de niveau 2 ou plus est décrit « Niveau N, sous-page de « P » », celui d'une racine ne l'est pas ; la liste reste plate, sans rôle d'arbre", async () => {
    await ouvrirTroisNiveaux();

    expect(description("Carnet")).toBeNull();
    expect(description("Voisine")).toBeNull();
    expect(description("Semaine")).toBe("Niveau 2, sous-page de « Carnet »");
    expect(description("Lundi")).toBe("Niveau 3, sous-page de « Semaine »");
    expect(
      within(barre()).getByRole("link", {
        name: "Lundi",
        description: "Niveau 3, sous-page de « Semaine »",
      }),
    ).toBe(lien("Lundi"));
    expect(within(barre()).getByRole("link", { name: "Carnet", description: "" })).toBeDefined();
    expect(barre().querySelector('[role="tree"], [role="treeitem"], [role="group"]')).toBeNull();
    expect(barre().querySelectorAll("ul")).toHaveLength(1);
    expect(barre().querySelectorAll("li li")).toHaveLength(0);
    expect(
      within(barre())
        .getAllByRole("listitem")
        .map((rangee) => rangee.getAttribute("aria-level")),
    ).toEqual(["1", "2", "3", "1"]);
  });

  it("F-004-AC55 la description suit le renommage de la page mère et le déplacement de la page ; une mère sans caractère visible se dit « Sans titre »", async () => {
    const { session } = await ouvrirTroisNiveaux();

    recevoir(session, (espace) => {
      espace.renommerPage(espace.lire().racines[0]?.enfants[0]?.id ?? "", "Quinzaine");
    });
    expect(description("Lundi")).toBe("Niveau 3, sous-page de « Quinzaine »");

    recevoir(session, (espace) => {
      const [carnet, voisine] = espace.lire().racines;
      const lundi = carnet?.enfants[0]?.enfants[0]?.id ?? "";
      espace.deplacerPage(lundi, { parent: voisine?.id ?? "" });
    });
    expect(description("Lundi")).toBe("Niveau 2, sous-page de « Voisine »");

    recevoir(session, (espace) => {
      espace.renommerPage(espace.lire().racines[1]?.id ?? "", "  \t");
    });
    expect(description("Lundi")).toBe("Niveau 2, sous-page de « Sans titre »");
  });

  it("F-004-AC55 F-004-AC24 arborescence de 12 niveaux aux titres de 200 caractères : chaque lien garde son titre entier pour nom, et sa description dit son niveau et sa mère", async () => {
    const { session } = await ouvrirCoquille();
    const titres = Array.from({ length: 12 }, (_, rang) =>
      `${String.fromCharCode(97 + rang)}`.repeat(200),
    );
    recevoir(session, (espace) => {
      let parent: string | null = null;
      for (const titre of titres) {
        parent = espace.creerPage(titre, { parent });
      }
    });

    titres.forEach((titre, rang) => {
      expect(lien(titre).textContent).toBe(titre);
      expect(description(titre)).toBe(
        rang === 0 ? null : `Niveau ${rang + 1}, sous-page de « ${titres[rang - 1]} »`,
      );
    });
  });

  it("F-004-AC56 la commande de repli garde le même nom avant et après l'activation, à la souris puis au clavier ; aria-expanded porte seul l'état", async () => {
    const { utilisateur } = await ouvrirTroisNiveaux();
    const commande = (): HTMLElement =>
      screen.getByRole("button", { name: "Sous-pages de « Carnet »" });
    expect(commande().getAttribute("aria-expanded")).toBe("true");
    expect(commande().querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    expect(commande().textContent).toBe("");

    await utilisateur.click(commande());

    expect(commande().getAttribute("aria-expanded")).toBe("false");
    expect(titresDeLaBarre()).toEqual(["Carnet", "Voisine"]);
    expect(document.activeElement).toBe(commande());

    await utilisateur.keyboard("{Enter}");

    expect(commande().getAttribute("aria-expanded")).toBe("true");
    expect(titresDeLaBarre()).toEqual(["Carnet", "Semaine", "Lundi", "Voisine"]);
    await utilisateur.keyboard(" ");
    expect(commande().getAttribute("aria-expanded")).toBe("false");
    const noms = within(barre())
      .getAllByRole("button")
      .map((bouton) => nomDe(bouton) ?? "");
    expect(noms.filter((nom) => /^(Replier|Déplier)/.test(nom))).toEqual([]);
    expect(noms).toContain("Sous-pages de « Carnet »");
  });

  it("F-004-AC57 un titre bordé d'espaces, d'une espace insécable et d'une tabulation est cité sans ses blancs de bord, caractère pour caractère, et la saisie rouvre sur le titre enregistré entier", async () => {
    const enregistre = "  \tPlan  de route\t  ";
    const cite = "Plan  de route";
    const { session, utilisateur } = await ouvrirCoquille();
    recevoir(session, (espace) => {
      const mere = espace.creerPage(enregistre);
      espace.creerPage("Fille", { parent: mere });
    });
    const rangee = within(barre()).getAllByRole("listitem")[0] as HTMLElement;

    const etiquettes = within(rangee)
      .getAllByRole("button")
      .map((bouton) => bouton.getAttribute("aria-label"));
    expect(etiquettes).toEqual([
      `Sous-pages de « ${cite} »`,
      `Ajouter une sous-page à « ${cite} »`,
      `Actions de la page « ${cite} »`,
    ]);
    expect(description("Fille")).toBe(`Niveau 2, sous-page de « ${cite} »`);
    expect(rangee.querySelector("a")?.textContent).toBe(enregistre);

    await utilisateur.click(within(rangee).getByRole("button", { name: /^Actions de la page/ }));
    const menu = screen.getByRole("menu");
    expect(menu.getAttribute("aria-label")).toBe(`Actions de la page « ${cite} »`);
    expect(
      within(menu)
        .getAllByRole("menuitem")
        .map((entree) => entree.getAttribute("aria-label") ?? entree.firstChild?.textContent),
    ).toEqual(ENTREES_DU_MENU);

    await utilisateur.keyboard("{Enter}");
    const champ = await screen.findByRole<HTMLInputElement>("textbox", CHAMP_TITRE);
    expect(champ.value).toBe(enregistre);
    expect([champ.selectionStart, champ.selectionEnd]).toEqual([0, enregistre.length]);
    await utilisateur.keyboard("{Escape}");
    const etat = session.lireEtat();
    expect(etat.phase === "pret" && etat.arborescence.racines[0]?.titre).toBe(enregistre);
  });
});

describe("création depuis la barre : rien ne change pour F-002", () => {
  it("F-004-AC17 « Nouvelle page » puis « Ajouter une sous-page » de la rangée produisent l'arbre de F-002-AC5", async () => {
    const { utilisateur } = await ouvrirCoquille();
    await creerPageNommee(utilisateur, "Racine");

    await utilisateur.click(screen.getByRole("button", { name: nomAjouterSousPage("Racine") }));
    await utilisateur.keyboard("Feuille{Enter}");

    await waitFor(() => expect(titresDeLaBarre()).toEqual(["Racine", "Feuille"]));
    expect(rangeeDe("Feuille").getAttribute("aria-level")).toBe("2");
  });
});
