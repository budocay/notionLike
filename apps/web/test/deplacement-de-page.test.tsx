// Déplacement d'une page dans l'application réelle, sous jsdom (F-006-AC1 à AC12, AC28, AC29,
// AC36). Sans mise en page, le geste se joue par les capteurs de la bibliothèque sur des rangées
// dont le test donne lui-même le rectangle (H11) : ce qui est prouvé est le câblage du geste jusqu'à
// `deplacerPage`, les repères, les annonces et les styles inscrits ; qu'une rangée soit survolée là
// où l'œil la voit, seul le bout en bout le prouve (F-006-AC34).
import { ErreurDocument } from "@notionlike/document";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

import {
  boutonDuMenu,
  type CoquilleRendue,
  docDe,
  etatEncode,
  INSTRUCTIONS_DU_GLISSER,
  nomDuMenu,
  nomDuRepli,
  ouvrirCoquille,
  recevoir,
  titresParFratrie,
} from "./aides-coquille.tsx";

type SessionEspace = CoquilleRendue["session"];

// Après un geste, la bibliothèque retient 50 ms les clics sur le document, puis retire son écouteur
// par une minuterie que la préparation des tests désarme en fin de test : le test suivant perdrait
// ses clics. Cette attente passe avant la préparation.
afterEach(() => new Promise<void>((suite) => setTimeout(suite, 60)));

const HAUTEUR = 30;
const LARGEUR = 240;

function barre(): HTMLElement {
  return screen.getByRole("navigation", { name: "Pages" });
}

function lien(titre: string): HTMLElement {
  return within(barre()).getByRole("link", { name: titre });
}

function rangeeDe(titre: string): HTMLElement {
  return lien(titre).closest("li") as HTMLElement;
}

function fratries(): string[][] {
  return titresParFratrie(barre());
}

function operations(session: SessionEspace) {
  const etat = session.lireEtat();
  if (etat.phase !== "pret") {
    throw new Error("L'espace n'est pas ouvert.");
  }
  return etat.operations;
}

/** Espionne l'opération du document que l'écran appelle. */
function espionnerDeplacerPage(session: SessionEspace) {
  return vi.spyOn(operations(session), "deplacerPage");
}

/** Mises à jour Yjs émises par le document d'espace à partir de maintenant. */
function compterLesMisesAJour(session: SessionEspace): { readonly nombre: () => number } {
  let nombre = 0;
  const noter = (): void => {
    nombre += 1;
  };
  docDe(session).on("update", noter);
  return { nombre: () => nombre };
}

// jsdom ne mesure rien : chaque rangée reçoit, dans l'ordre affiché, un rectangle de 30 pixels de
// haut, empilé depuis le haut de la fenêtre (H11, veille dnd-kit).
function poserLesRectangles(): void {
  within(barre())
    .getAllByRole("listitem")
    .forEach((rangee, rang) => {
      const rectangle = new DOMRect(0, rang * HAUTEUR, LARGEUR, HAUTEUR);
      Object.defineProperty(rangee, "getBoundingClientRect", {
        configurable: true,
        value: () => rectangle,
      });
      Object.defineProperty(rangee, "offsetHeight", { configurable: true, value: HAUTEUR });
      Object.defineProperty(rangee, "offsetWidth", { configurable: true, value: LARGEUR });
    });
}

type Hauteur = "haut" | "milieu" | "bas";
const DECALAGE: Readonly<Record<Hauteur, number>> = { haut: 3, milieu: 15, bas: 27 };

function ordonneeDe(titre: string, hauteur: Hauteur): number {
  return rangeeDe(titre).getBoundingClientRect().top + DECALAGE[hauteur];
}

const ABSCISSE = 40;

/** Saisit la rangée au pointeur et la fait glisser au-delà de la distance d'activation. */
function saisir(titre: string): void {
  poserLesRectangles();
  const depart = ordonneeDe(titre, "milieu");
  fireEvent.pointerDown(rangeeDe(titre), {
    clientX: ABSCISSE,
    clientY: depart,
    isPrimary: true,
    button: 0,
  });
  fireEvent.pointerMove(document, { clientX: ABSCISSE, clientY: depart + 8 });
}

/** Amène le pointeur à une hauteur d'une rangée, ou à une ordonnée hors de toute rangée. */
function survoler(cible: string | number, hauteur: Hauteur = "milieu"): void {
  const ordonnee = typeof cible === "number" ? cible : ordonneeDe(cible, hauteur);
  fireEvent.pointerMove(document, { clientX: ABSCISSE, clientY: ordonnee });
  fireEvent.pointerMove(document, { clientX: ABSCISSE + 1, clientY: ordonnee });
}

function lacher(): void {
  fireEvent.pointerUp(document);
}

function glisser(source: string, cible: string, hauteur: Hauteur): void {
  saisir(source);
  survoler(cible, hauteur);
  lacher();
}

/** Les repères de dépôt affichés : la rangée qui le porte et sa zone. */
function reperes(): string[] {
  return [...barre().querySelectorAll("[data-repere-de-depot]")].map(
    (repere) =>
      `${repere.closest("li")?.querySelector("a")?.textContent ?? ""}:${repere.getAttribute("data-repere-de-depot") ?? ""}`,
  );
}

/** Trois racines, et deux sous-pages sous la première : A(A1, A2), B, C. */
async function ouvrirLArbre(): Promise<CoquilleRendue> {
  const coquille = await ouvrirCoquille();
  recevoir(coquille.session, (espace) => {
    const a = espace.creerPage("A");
    espace.creerPage("A1", { parent: a });
    espace.creerPage("A2", { parent: a });
    espace.creerPage("B");
    espace.creerPage("C");
  });
  return coquille;
}

function idDe(session: SessionEspace, titre: string): string {
  const etat = session.lireEtat();
  if (etat.phase !== "pret") {
    throw new Error("L'espace n'est pas ouvert.");
  }
  const aVoir = [...etat.arborescence.racines];
  for (const page of aVoir) {
    if (page.titre === titre) {
      return page.id;
    }
    aVoir.push(...page.enfants);
  }
  throw new Error(`Aucune page « ${titre} ».`);
}

describe("déplacement d'une page au pointeur", () => {
  it("F-006-AC1 F-006-AC2 lâchée avant une rangée, la page y arrive par un seul appel de deplacerPage, repère « avant » affiché pendant le survol", async () => {
    const { session } = await ouvrirLArbre();
    const appel = espionnerDeplacerPage(session);

    saisir("C");
    survoler("A", "haut");
    expect(reperes()).toEqual(["A:avant"]);
    lacher();

    expect(reperes()).toEqual([]);
    expect(appel).toHaveBeenCalledTimes(1);
    expect(appel).toHaveBeenCalledWith(idDe(session, "C"), { parent: null, position: 0 });
    expect(fratries()).toEqual([
      ["C", "A", "B"],
      ["A1", "A2"],
    ]);
  });

  it("F-006-AC1 F-006-AC2 lâchée après une rangée, la page y arrive avec toute sa descendance", async () => {
    const { session } = await ouvrirLArbre();
    const appel = espionnerDeplacerPage(session);

    saisir("A");
    survoler("B", "bas");
    expect(reperes()).toEqual(["B:apres"]);
    lacher();

    expect(appel).toHaveBeenCalledTimes(1);
    expect(appel).toHaveBeenCalledWith(idDe(session, "A"), { parent: null, position: 1 });
    expect(fratries()).toEqual([
      ["B", "A", "C"],
      ["A1", "A2"],
    ]);
  });

  it("F-006-AC1 F-006-AC3 lâchée dans une rangée repliée, la page en devient la dernière sous-page, position absente, et la cible se déplie", async () => {
    const coquille = await ouvrirLArbre();
    const appel = espionnerDeplacerPage(coquille.session);
    await coquille.utilisateur.click(screen.getByRole("button", { name: nomDuRepli("A") }));
    expect(fratries()).toEqual([["A", "B", "C"]]);

    saisir("C");
    survoler("A", "milieu");
    expect(reperes()).toEqual(["A:dans"]);
    lacher();

    expect(appel).toHaveBeenCalledWith(idDe(coquille.session, "C"), {
      parent: idDe(coquille.session, "A"),
    });
    expect(
      screen.getByRole("button", { name: nomDuRepli("A") }).getAttribute("aria-expanded"),
    ).toBe("true");
    expect(fratries()).toEqual([
      ["A", "B"],
      ["A1", "A2", "C"],
    ]);
  });

  it("F-006-AC1 F-006-AC5 sur la place que la page occupe déjà, aucun repère, ni appel ni mise à jour Yjs au lâcher", async () => {
    const { session } = await ouvrirLArbre();
    const appel = espionnerDeplacerPage(session);
    const misesAJour = compterLesMisesAJour(session);

    for (const [page, cible, hauteur] of [
      ["A", "B", "haut"],
      ["B", "A", "bas"],
      ["A2", "A", "milieu"],
      ["A1", "A2", "haut"],
    ] as const) {
      saisir(page);
      survoler(cible, hauteur);
      expect(reperes(), `${page} sur ${cible}, ${hauteur}`).toEqual([]);
      lacher();
    }

    expect(appel).not.toHaveBeenCalled();
    expect(misesAJour.nombre()).toBe(0);
    expect(fratries()).toEqual([
      ["A", "B", "C"],
      ["A1", "A2"],
    ]);
  });

  it("F-006-AC5 lâchée juste avant sa suivante, la page ne bouge pas : rien n'est appelé, rien n'est émis", async () => {
    const { session } = await ouvrirLArbre();
    const appel = espionnerDeplacerPage(session);
    const misesAJour = compterLesMisesAJour(session);

    saisir("B");
    survoler("C", "haut");
    expect(reperes()).toEqual([]);
    lacher();
    saisir("A2");
    survoler("A1", "bas");
    expect(reperes()).toEqual([]);
    lacher();

    expect(appel).not.toHaveBeenCalled();
    expect(misesAJour.nombre()).toBe(0);
    expect(fratries()).toEqual([
      ["A", "B", "C"],
      ["A1", "A2"],
    ]);
  });

  it("F-006-AC6 aucune zone de dépôt sur la rangée glissée ni sur ses descendantes, et un lâcher là ne modifie rien", async () => {
    const { session } = await ouvrirLArbre();
    const appel = espionnerDeplacerPage(session);
    const avant = etatEncode(session);

    for (const cible of ["A", "A1", "A2"]) {
      for (const hauteur of ["haut", "milieu", "bas"] as const) {
        saisir("A");
        survoler(cible, hauteur);
        expect(reperes(), `${cible} ${hauteur}`).toEqual([]);
        lacher();
      }
    }

    expect(appel).not.toHaveBeenCalled();
    expect(etatEncode(session)).toEqual(avant);
  });

  it("F-006-AC6 F-006-AC30 si deplacerPage refuse malgré tout par deplacement-cyclique, le message de F-002-AC15 s'affiche, l'arborescence reste celle lue, aucune mise à jour Yjs", async () => {
    const { session } = await ouvrirLArbre();
    const misesAJour = compterLesMisesAJour(session);
    espionnerDeplacerPage(session).mockImplementation(() => {
      throw new ErreurDocument("deplacement-cyclique", "essai");
    });

    glisser("C", "A", "milieu");

    expect(within(barre()).getByRole("alert").textContent).toBe(
      "Une page ne peut pas être déplacée dans l'une de ses sous-pages.",
    );
    expect(fratries()).toEqual([
      ["A", "B", "C"],
      ["A1", "A2"],
    ]);
    expect(misesAJour.nombre()).toBe(0);
  });

  it("F-006-AC7 Échap pendant un geste l'abandonne sans appeler deplacerPage", async () => {
    const { session } = await ouvrirLArbre();
    const appel = espionnerDeplacerPage(session);

    saisir("C");
    survoler("A", "haut");
    expect(reperes()).toEqual(["A:avant"]);
    fireEvent.keyDown(document, { key: "Escape", code: "Escape" });
    expect(reperes()).toEqual([]);
    lacher();

    expect(appel).not.toHaveBeenCalled();
    expect(fratries()).toEqual([
      ["A", "B", "C"],
      ["A1", "A2"],
    ]);
  });

  it("F-006-AC7 un lâcher hors de toute zone de dépôt abandonne le geste sans appeler deplacerPage", async () => {
    const { session } = await ouvrirLArbre();
    const appel = espionnerDeplacerPage(session);

    saisir("C");
    survoler("A", "haut");
    survoler(HAUTEUR * 40);
    expect(reperes()).toEqual([]);
    lacher();

    expect(appel).not.toHaveBeenCalled();
    expect(fratries()).toEqual([
      ["A", "B", "C"],
      ["A1", "A2"],
    ]);
  });

  it("F-006-AC8 si la page glissée, ou la rangée cible, quitte l'arborescence lue pendant le geste, le lâcher n'appelle pas deplacerPage et l'arborescence affichée est à jour", async () => {
    const { session } = await ouvrirLArbre();
    const appel = espionnerDeplacerPage(session);

    saisir("C");
    survoler("A", "haut");
    recevoir(session, (espace) => espace.mettreALaCorbeille(idDe(session, "C")));
    lacher();
    expect(fratries()).toEqual([
      ["A", "B"],
      ["A1", "A2"],
    ]);

    saisir("B");
    survoler("A1", "bas");
    expect(reperes()).toEqual(["A1:apres"]);
    recevoir(session, (espace) => espace.mettreALaCorbeille(idDe(session, "A1")));
    lacher();

    expect(appel).not.toHaveBeenCalled();
    expect(fratries()).toEqual([["A", "B"], ["A2"]]);
  });

  it("F-006-AC29 pendant un geste, chaque rangée ne porte en ligne que `transform`, sans transition, durée ni courbe ; la rangée glissée suit le pointeur", async () => {
    await ouvrirLArbre();

    saisir("C");
    survoler("A", "haut");
    const styles = within(barre())
      .getAllByRole("listitem")
      .map((rangee) => rangee.getAttribute("style") ?? "");
    lacher();

    for (const style of styles) {
      expect(style).not.toMatch(/transition|animation|\d+m?s\b|ease|cubic-bezier|steps\(/);
      expect(
        style
          .split(";")
          .map((declaration) => declaration.split(":")[0]?.trim())
          .filter((propriete) => propriete !== undefined && propriete !== ""),
      ).toEqual(expect.arrayContaining(["--niveau"]));
    }
    expect(styles.filter((style) => style.includes("transform"))).toHaveLength(1);
    // La rangée de C, cinquième, suit le pointeur remonté vers A.
    expect(styles[4]).toMatch(/transform: translate3d\(-?\d+px, -\d+px, 0\)/);
  });

  it("F-006-AC29 un style de rangée qui porte une transition ou une durée est refusé par ce contrôle", () => {
    const refuse = /transition|animation|\d+m?s\b|ease|cubic-bezier|steps\(/;

    expect("--niveau: 1; transform: translate3d(0px, 4px, 0);").not.toMatch(refuse);
    expect("transform: translate3d(0px, 4px, 0); transition: transform 200ms ease;").toMatch(
      refuse,
    );
    expect("transition: opacity var(--duree-rapide);").toMatch(refuse);
  });
});

describe("déplacement d'une page au clavier", () => {
  async function ouvrirLeMenu(coquille: CoquilleRendue, titre: string): Promise<HTMLElement> {
    await coquille.utilisateur.click(await boutonDuMenu(titre));
    return screen.getByRole("menu", { name: nomDuMenu(titre) });
  }

  it("F-006-AC10 F-006-AC28 le menu « ⋯ » porte les quatre commandes, nommées en français, chacune avec son raccourci Alt+Maj+Flèche exposé par aria-keyshortcuts", async () => {
    const coquille = await ouvrirLArbre();

    const menu = await ouvrirLeMenu(coquille, "B");

    const commandes = [
      "Monter",
      "Descendre",
      "Mettre sous la page précédente",
      "Sortir d'un niveau",
    ];
    expect(
      commandes.map((nom) =>
        within(menu).getByRole("menuitem", { name: nom }).getAttribute("aria-keyshortcuts"),
      ),
    ).toEqual([
      "Alt+Shift+ArrowUp",
      "Alt+Shift+ArrowDown",
      "Alt+Shift+ArrowRight",
      "Alt+Shift+ArrowLeft",
    ]);
  });

  /** Au clavier seul : focus sur « ⋯ », Entrée, Flèche bas jusqu'à la commande, Entrée. */
  async function activerAuClavier(coquille: CoquilleRendue, titre: string, commande: string) {
    act(() => rangeeDe(titre).querySelector<HTMLElement>("[aria-haspopup='menu']")?.focus());
    await coquille.utilisateur.keyboard("{Enter}");
    for (
      let pas = 0;
      pas < 10 && document.activeElement?.firstChild?.textContent !== commande;
      pas += 1
    ) {
      await coquille.utilisateur.keyboard("{ArrowDown}");
    }
    expect(document.activeElement?.firstChild?.textContent).toBe(commande);
    await coquille.utilisateur.keyboard("{Enter}");
  }

  it("F-006-AC10 F-006-AC12 chaque commande du menu, atteinte et déclenchée au clavier seul, déplace la page ; le focus reste dans sa rangée, et la nouvelle place est annoncée", async () => {
    const coquille = await ouvrirLArbre();
    const statut = within(barre()).getByRole("status");
    const parcours: unknown[] = [];

    for (const commande of [
      "Descendre",
      "Mettre sous la page précédente",
      "Sortir d'un niveau",
      "Monter",
    ]) {
      await activerAuClavier(coquille, "B", commande);
      parcours.push([fratries(), statut.textContent]);
      expect(rangeeDe("B").contains(document.activeElement)).toBe(true);
    }

    expect(parcours).toEqual([
      [
        [
          ["A", "C", "B"],
          ["A1", "A2"],
        ],
        "« B » déplacée à la racine, position 3 sur 3.",
      ],
      [[["A", "C"], ["A1", "A2"], ["B"]], "« B » déplacée sous « C », position 1 sur 1."],
      [
        [
          ["A", "C", "B"],
          ["A1", "A2"],
        ],
        "« B » déplacée à la racine, position 3 sur 3.",
      ],
      [
        [
          ["A", "B", "C"],
          ["A1", "A2"],
        ],
        "« B » déplacée à la racine, position 2 sur 3.",
      ],
    ]);
  });

  it("F-006-AC10 F-006-AC12 Alt+Maj+Flèche sur la rangée qui a le focus déplace la page ; le focus reste sur son lien et la nouvelle place est annoncée", async () => {
    const coquille = await ouvrirLArbre();
    const statut = within(barre()).getByRole("status");
    const parcours: unknown[] = [];
    act(() => lien("C").focus());

    for (const touche of ["ArrowUp", "ArrowRight", "ArrowDown", "ArrowLeft"]) {
      await coquille.utilisateur.keyboard(`{Alt>}{Shift>}{${touche}}{/Shift}{/Alt}`);
      expect(document.activeElement).toBe(lien("C"));
      parcours.push([touche, fratries(), statut.textContent]);
    }

    expect(parcours).toEqual([
      [
        "ArrowUp",
        [
          ["A", "C", "B"],
          ["A1", "A2"],
        ],
        "« C » déplacée à la racine, position 2 sur 3.",
      ],
      [
        "ArrowRight",
        [
          ["A", "B"],
          ["A1", "A2", "C"],
        ],
        "« C » déplacée sous « A », position 3 sur 3.",
      ],
      // Dernière sous-page de A : rien plus bas, l'annonce précédente demeure.
      [
        "ArrowDown",
        [
          ["A", "B"],
          ["A1", "A2", "C"],
        ],
        "« C » déplacée sous « A », position 3 sur 3.",
      ],
      [
        "ArrowLeft",
        [
          ["A", "C", "B"],
          ["A1", "A2"],
        ],
        "« C » déplacée à la racine, position 2 sur 3.",
      ],
    ]);
  });

  it("F-006-AC11 F-006-AC28 une commande sans destination est exposée indisponible, avec sa raison, et ni elle ni son raccourci n'appellent deplacerPage", async () => {
    const coquille = await ouvrirLArbre();
    const appel = espionnerDeplacerPage(coquille.session);
    const avant = etatEncode(coquille.session);

    const menu = await ouvrirLeMenu(coquille, "A");
    const indisponibles = within(menu)
      .getAllByRole("menuitem")
      .filter((entree) => entree.hasAttribute("disabled"))
      .map((entree) => [
        entree.firstChild?.textContent,
        document.getElementById(entree.getAttribute("aria-describedby") ?? "")?.textContent,
      ]);
    fireEvent.keyDown(menu, { key: "Escape" });
    for (const [titre, touche] of [
      ["A", "ArrowUp"],
      ["A", "ArrowRight"],
      ["A", "ArrowLeft"],
      ["C", "ArrowDown"],
      ["A1", "ArrowUp"],
      ["A1", "ArrowRight"],
    ] as const) {
      act(() => lien(titre).focus());
      await coquille.utilisateur.keyboard(`{Alt>}{Shift>}{${touche}}{/Shift}{/Alt}`);
    }

    expect(indisponibles).toEqual([
      ["Monter", "La page est déjà la première de son niveau."],
      ["Mettre sous la page précédente", "Aucune page ne la précède à son niveau."],
      ["Sortir d'un niveau", "La page est déjà à la racine."],
    ]);
    expect(appel).not.toHaveBeenCalled();
    expect(etatEncode(coquille.session)).toEqual(avant);
  });

  it("F-006-AC11 la dernière sœur ne descend pas : « Descendre » est indisponible avec sa raison", async () => {
    const coquille = await ouvrirLArbre();

    const menu = await ouvrirLeMenu(coquille, "A2");
    const descendre = within(menu).getByRole("menuitem", { name: "Descendre" });

    expect(descendre.hasAttribute("disabled")).toBe(true);
    expect(
      document.getElementById(descendre.getAttribute("aria-describedby") ?? "")?.textContent,
    ).toBe("La page est déjà la dernière de son niveau.");
  });
});

describe("ce qu'un déplacement laisse en place", () => {
  it("F-006-AC9 au pointeur comme au clavier, la page sélectionnée, l'adresse et le repli des autres pages restent ; le nouveau parent se déplie ; aucun document de page n'est modifié", async () => {
    const coquille = await ouvrirLArbre();
    recevoir(coquille.session, (espace) => {
      const b = espace.lire().racines[1]?.id ?? "";
      espace.creerPage("B1", { parent: b });
    });
    await coquille.utilisateur.click(lien("A1"));
    const adresse = window.location.hash;
    await coquille.utilisateur.click(screen.getByRole("button", { name: nomDuRepli("B") }));
    const emissions = vi.spyOn(Y.Doc.prototype, "emit");

    glisser("A1", "C", "bas");
    act(() => lien("A2").focus());
    await coquille.utilisateur.keyboard("{Alt>}{Shift>}{ArrowLeft}{/Shift}{/Alt}");

    expect(fratries()).toEqual([["A", "A2", "B", "C", "A1"]]);
    expect(window.location.hash).toBe(adresse);
    expect(lien("A1").getAttribute("aria-current")).toBe("page");
    expect(
      screen.getByRole("button", { name: nomDuRepli("B") }).getAttribute("aria-expanded"),
    ).toBe("false");
    const documentsEcrits = new Set(
      emissions.mock.calls
        .map((appel, rang) => [appel[0], emissions.mock.contexts[rang]] as const)
        .filter(([nom]) => nom === "update")
        .map(([, doc]) => doc),
    );
    expect([...documentsEcrits]).toEqual([docDe(coquille.session)]);
  });

  it("F-006-AC9 le nouveau parent replié se déplie, et lui seul", async () => {
    const coquille = await ouvrirLArbre();
    recevoir(coquille.session, (espace) => {
      const b = espace.lire().racines[1]?.id ?? "";
      espace.creerPage("B1", { parent: b });
    });
    await coquille.utilisateur.click(screen.getByRole("button", { name: nomDuRepli("A") }));
    await coquille.utilisateur.click(screen.getByRole("button", { name: nomDuRepli("B") }));
    act(() => lien("C").focus());

    await coquille.utilisateur.keyboard("{Alt>}{Shift>}{ArrowRight}{/Shift}{/Alt}");

    expect(fratries()).toEqual([
      ["A", "B"],
      ["B1", "C"],
    ]);
    expect(
      screen.getByRole("button", { name: nomDuRepli("A") }).getAttribute("aria-expanded"),
    ).toBe("false");
  });
});

const TEXTES_PAR_DEFAUT_DE_LA_BIBLIOTHEQUE =
  /draggable|droppable|space bar|arrow keys|press escape|picked up|was moved|was dropped|cancelled|sortable/i;

describe("annonces du geste en français", () => {
  it("F-006-AC36 saisie, déplacement et dépôt d'une rangée par le capteur clavier : région d'annonces, instructions et attributs ARIA de la rangée en français, chaque annonce nommant la page", async () => {
    const coquille = await ouvrirLArbre();
    poserLesRectangles();
    const appel = espionnerDeplacerPage(coquille.session);
    const annonces: string[] = [];
    const region = (): HTMLElement | null =>
      document.querySelector<HTMLElement>("[aria-live='assertive']");
    const noter = (): void => void annonces.push(region()?.textContent ?? "");
    const attendre = () => act(() => new Promise<void>((suite) => setTimeout(suite, 40)));

    act(() => lien("C").focus());
    fireEvent.keyDown(lien("C"), { key: " ", code: "Space" });
    await attendre();
    noter();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "ArrowUp", code: "ArrowUp" });
    await attendre();
    noter();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: " ", code: "Space" });
    await attendre();
    noter();

    const instructions = document.getElementById(
      (lien("C").getAttribute("aria-describedby") ?? "").split(" ").at(-1) ?? "",
    );
    expect(instructions?.textContent).toBe(INSTRUCTIONS_DU_GLISSER);
    expect(annonces).toEqual([
      "Page « C » saisie.",
      expect.stringMatching(/^« C » irait (avant|après|dans) « B »\.$/),
      expect.stringMatching(/^« C » déposée (avant|après|dans) « B »\.$/),
    ]);
    expect(appel).toHaveBeenCalledTimes(1);
    const rangee = rangeeDe("C");
    const attributs = [rangee, ...rangee.querySelectorAll("*")].flatMap((element) =>
      [...element.attributes]
        .filter((attribut) => attribut.name.startsWith("aria-") || attribut.name === "role")
        .map((attribut) => attribut.value),
    );
    const textesLus = [
      ...annonces,
      instructions?.textContent ?? "",
      ...attributs,
      ...[...document.querySelectorAll("[id^='DndDescribedBy'], [id^='DndLiveRegion']")].map(
        (element) => element.textContent ?? "",
      ),
    ];
    expect(textesLus.filter((texte) => TEXTES_PAR_DEFAUT_DE_LA_BIBLIOTHEQUE.test(texte))).toEqual(
      [],
    );
    expect(rangee.querySelector("[aria-roledescription]")).toBeNull();
    expect(rangee.hasAttribute("aria-roledescription")).toBe(false);
  });

  it("F-006-AC36 le contrôle reconnaît les textes par défaut de la bibliothèque, en anglais", () => {
    for (const anglais of [
      "Picked up draggable item c.",
      "Draggable item c was moved over droppable area b.",
      "Draggable item c was dropped over droppable area b",
      "Dragging was cancelled. Draggable item c was dropped.",
      "To pick up a draggable item, press the space bar.",
      "sortable",
    ]) {
      expect(TEXTES_PAR_DEFAUT_DE_LA_BIBLIOTHEQUE.test(anglais), anglais).toBe(true);
    }
    expect(TEXTES_PAR_DEFAUT_DE_LA_BIBLIOTHEQUE.test("Page « C » saisie.")).toBe(false);
  });
});

describe("repère de dépôt", () => {
  it("F-006-AC28 le repère n'est pas la couleur seule : un trait au-dessus ou au-dessous de la rangée, un contour en tirets pour « dans », et l'annonce le dit en toutes lettres", async () => {
    await ouvrirLArbre();
    const formes: Record<string, string> = {};

    for (const hauteur of ["haut", "milieu", "bas"] as const) {
      saisir("B");
      survoler("A1", hauteur);
      const repere = barre().querySelector("[data-repere-de-depot]");
      formes[repere?.getAttribute("data-repere-de-depot") ?? ""] = repere?.className ?? "";
      fireEvent.keyDown(document, { key: "Escape", code: "Escape" });
      lacher();
    }

    expect(formes.avant?.split(" ")).toEqual(expect.arrayContaining(["top-nul", "h-repere"]));
    expect(formes.apres?.split(" ")).toEqual(expect.arrayContaining(["bottom-nul", "h-repere"]));
    expect(formes.dans?.split(" ")).toEqual(expect.arrayContaining(["contour-de-depot"]));
    await waitFor(() => expect(reperes()).toEqual([]));
  });
});

const MESSAGES_DE_REFUS = [
  ["page-introuvable", "Cette page n'existe plus : l'action n'a pas été effectuée."],
  ["page-a-la-corbeille", "Cette page a été mise à la corbeille : l'action n'a pas été effectuée."],
  ["deplacement-cyclique", "Une page ne peut pas être déplacée dans l'une de ses sous-pages."],
  ["position-invalide", "Cet emplacement n'existe plus : l'action n'a pas été effectuée."],
] as const;

describe("refus du document", () => {
  it.each(MESSAGES_DE_REFUS)(
    "F-006-AC30 F-002-AC15 le refus typé %s, au clavier comme au pointeur, aboutit au message de F-002-AC15, l'arborescence affichée restant celle lue, sans mise à jour Yjs",
    async (code, message) => {
      const coquille = await ouvrirLArbre();
      const misesAJour = compterLesMisesAJour(coquille.session);
      espionnerDeplacerPage(coquille.session).mockImplementation(() => {
        throw new ErreurDocument(code, "essai");
      });

      act(() => lien("C").focus());
      await coquille.utilisateur.keyboard("{Alt>}{Shift>}{ArrowUp}{/Shift}{/Alt}");
      const auClavier = within(barre()).getByRole("alert").textContent;
      glisser("B", "A", "haut");

      expect(auClavier).toBe(message);
      expect(within(barre()).getByRole("alert").textContent).toBe(message);
      expect(fratries()).toEqual([
        ["A", "B", "C"],
        ["A1", "A2"],
      ]);
      expect(within(barre()).getByRole("status").textContent).toBe("");
      expect(misesAJour.nombre()).toBe(0);
    },
  );
});

describe("réseau coupé", () => {
  it("F-006-AC33 au pointeur comme au clavier, une page se déplace réseau coupé, sans aucune requête", async () => {
    const coquille = await ouvrirLArbre();
    const appels: string[] = [];
    for (const nom of ["fetch", "XMLHttpRequest", "WebSocket", "EventSource"]) {
      vi.stubGlobal(nom, () => {
        appels.push(nom);
        throw new Error(`F-006-AC33 : ${nom} appelé pendant un déplacement.`);
      });
    }

    glisser("C", "A", "haut");
    act(() => lien("B").focus());
    await coquille.utilisateur.keyboard("{Alt>}{Shift>}{ArrowRight}{/Shift}{/Alt}");

    expect(fratries()).toEqual([
      ["C", "A"],
      ["A1", "A2", "B"],
    ]);
    expect(appels).toEqual([]);
  });
});
