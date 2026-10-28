// Vue kanban rendue par l'écran de table : clavier, geste au pointeur, noms accessibles, texte brut,
// lecture seule, réseau (F-020-AC9, AC12, AC13, AC15, AC21, AC22, AC23, AC24, AC28). Le geste passe
// par le module de glisser-déposer réel sous jsdom, avec une mise en page bouchonnée (H6, H11) ; le
// geste de la souris dans un vrai navigateur est éprouvé par `e2e/kanban.spec.ts`.
import { ErreurDocument } from "@notionlike/document";
import { act, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

import { KANBAN } from "../../src/interface/composants/kanban.classes.ts";
import {
  abandonnerLeGeste,
  annonceDeLaVue,
  bouchonnerLaMiseEnPage,
  carte,
  glisserLaCarteDe,
  lacherLaCarte,
  nomsDesPiles,
  rendreLeKanban,
  saisirLaCarteDe,
  titresDeLaPile,
} from "./aides-ecran-kanban.tsx";

const REPARTITION = [
  ["Écrire", 0],
  ["Relire", 0],
  ["Sans statut", -1],
  ["Livrer", 2],
] as const;

function plateau(): HTMLElement {
  return screen.getByRole("group", { name: /^Kanban de la table/ });
}

// Tout ce qui, dans le plateau, est dans l'ordre de tabulation (F-020-AC15).
function arretsDeTabulation(dans: HTMLElement): HTMLElement[] {
  return [
    ...dans.querySelectorAll<HTMLElement>("a[href], button, input, select, textarea, [tabindex]"),
  ].filter((element) => element.tabIndex >= 0 && !element.hasAttribute("disabled"));
}

// Le texte des alertes affichées : vide quand la vue n'en dit aucune.
function alertes(): string {
  return screen
    .queryAllByRole("alert")
    .map((alerte) => alerte.textContent)
    .join("");
}

const DESCENDRE = "{Alt>}{Shift>}{ArrowDown}{/Shift}{/Alt}";
const MONTER = "{Alt>}{Shift>}{ArrowUp}{/Shift}{/Alt}";
const DROITE = "{Alt>}{Shift>}{ArrowRight}{/Shift}{/Alt}";
const GAUCHE = "{Alt>}{Shift>}{ArrowLeft}{/Shift}{/Alt}";

describe("commandes au clavier (F-020-AC13, AC15)", () => {
  it("F-020-AC13 F-020-AC15 les quatre raccourcis déplacent la carte, qui garde le focus ; l'annonce dit son libellé, sa pile et sa place", async () => {
    const { utilisateur, emises } = rendreLeKanban(REPARTITION);
    carte("Écrire").focus();

    await utilisateur.keyboard(DESCENDRE);
    expect(titresDeLaPile("À faire, 2 cartes")).toEqual(["Relire", "Écrire"]);
    expect(document.activeElement).toBe(carte("Écrire"));
    expect(annonceDeLaVue()).toBe("Écrire, pile À faire, 2 sur 2.");

    await utilisateur.keyboard(DROITE);
    expect(titresDeLaPile("En cours, 1 carte")).toEqual(["Écrire"]);
    expect(document.activeElement).toBe(carte("Écrire"));
    expect(annonceDeLaVue()).toBe("Écrire, pile En cours, 1 sur 1.");

    await utilisateur.keyboard(GAUCHE);
    expect(titresDeLaPile("À faire, 2 cartes")).toEqual(["Relire", "Écrire"]);

    await utilisateur.keyboard(MONTER);
    expect(titresDeLaPile("À faire, 2 cartes")).toEqual(["Écrire", "Relire"]);
    expect(annonceDeLaVue()).toBe("Écrire, pile À faire, 1 sur 2.");
    expect(emises.length).toBeGreaterThan(0);
  });

  it("F-020-AC13 une commande sans destination ne change rien et n'émet aucune mise à jour : première ou dernière pile, première ou dernière carte", async () => {
    const { utilisateur, emises } = rendreLeKanban(REPARTITION);

    carte("Sans statut").focus();
    await utilisateur.keyboard(GAUCHE + MONTER + DESCENDRE);
    carte("Livrer").focus();
    await utilisateur.keyboard(DROITE + MONTER + DESCENDRE);
    carte("Écrire").focus();
    await utilisateur.keyboard(MONTER);
    carte("Relire").focus();
    await utilisateur.keyboard(DESCENDRE);

    expect(emises).toHaveLength(0);
    expect(annonceDeLaVue()).toBe("Déjà la dernière carte de la pile.");
  });

  it("F-020-AC13 F-020-AC21 le menu des actions expose les quatre commandes, chacune nommée avec la carte, indisponible avec sa raison à un bord ; atteint au clavier seul", async () => {
    const { utilisateur, emises } = rendreLeKanban(REPARTITION);
    carte("Écrire").focus();
    await utilisateur.keyboard("{Shift>}{F10}{/Shift}");

    const menu = screen.getByRole("menu", { name: "Actions de la carte Écrire" });
    const noms = within(menu)
      .getAllByRole("menuitem")
      .map((entree) => entree.getAttribute("aria-label") ?? entree.textContent);
    expect(noms).toEqual([
      "Pile précédente pour la carte Écrire",
      "Pile suivante pour la carte Écrire",
      "Monter pour la carte Écrire",
      "Descendre pour la carte Écrire",
      "Modifier le titre pour la carte Écrire",
      "Supprimer la ligne pour la carte Écrire",
    ]);
    const monter = within(menu).getByRole("menuitem", { name: "Monter pour la carte Écrire" });
    expect(monter.getAttribute("aria-disabled") ?? String(monter.hasAttribute("disabled"))).toBe(
      "true",
    );
    fireEvent.click(monter);
    expect(emises).toHaveLength(0);

    await utilisateur.click(
      within(menu).getByRole("menuitem", { name: "Descendre pour la carte Écrire" }),
    );
    expect(titresDeLaPile("À faire, 2 cartes")).toEqual(["Relire", "Écrire"]);
    expect(document.activeElement).toBe(carte("Écrire"));
  });

  it("F-020-AC15 les flèches déplacent le focus de carte en carte, de pile en pile et jusqu'aux commandes de pile, sans rien écrire", async () => {
    const { utilisateur, emises } = rendreLeKanban(REPARTITION);
    const nouvelle = (pile: string) =>
      screen.getByRole("button", { name: `Nouvelle carte dans la pile ${pile}` });

    carte("Sans statut").focus();
    await utilisateur.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(carte("Écrire"));
    await utilisateur.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(carte("Relire"));
    // Sous la dernière carte d'une pile : sa commande « Nouvelle carte », puis la pile voisine, vide.
    await utilisateur.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(nouvelle("À faire"));
    await utilisateur.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(nouvelle("En cours"));
    await utilisateur.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(nouvelle("Fait"));
    await utilisateur.keyboard("{ArrowUp}{ArrowLeft}");
    expect(document.activeElement).toBe(nouvelle("En cours"));
    await utilisateur.keyboard("{ArrowLeft}{ArrowUp}{Home}");
    expect(document.activeElement).toBe(carte("Écrire"));
    await utilisateur.keyboard("{End}");
    expect(document.activeElement).toBe(nouvelle("À faire"));
    await utilisateur.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(nouvelle("À faire"));

    expect(emises).toHaveLength(0);
  });

  it("F-020-AC15 la vue compte pour un seul arrêt de tabulation, toutes commandes comprises : Tab y entre, Tab en sort", async () => {
    const { utilisateur, emises } = rendreLeKanban(REPARTITION);
    const tableau = plateau();
    expect(arretsDeTabulation(tableau)).toEqual([carte("Sans statut")]);

    // Le sélecteur de vues précède le plateau : Tab de « Kanban » entre dans le plateau, une fois.
    screen.getByRole("button", { name: "Kanban" }).focus();
    await utilisateur.tab();
    expect(document.activeElement).toBe(carte("Sans statut"));
    await utilisateur.tab();
    expect(tableau.contains(document.activeElement)).toBe(false);
    await utilisateur.tab({ shift: true });
    expect(document.activeElement).toBe(carte("Sans statut"));

    // Le focus d'une commande de pile devient l'arrêt unique : Tab en sort aussi, et y revient.
    await utilisateur.keyboard("{ArrowDown}");
    const nouvelle = screen.getByRole("button", {
      name: "Nouvelle carte dans la pile Sans valeur",
    });
    expect(document.activeElement).toBe(nouvelle);
    expect(arretsDeTabulation(tableau)).toEqual([nouvelle]);
    await utilisateur.tab();
    expect(tableau.contains(document.activeElement)).toBe(false);
    await utilisateur.tab({ shift: true });
    expect(document.activeElement).toBe(nouvelle);
    expect(emises).toHaveLength(0);
  });

  it("F-020-AC15 sans aucune carte, la première commande « Nouvelle carte » est l'arrêt unique, et Entrée la déclenche", async () => {
    const { utilisateur, emises, table } = rendreLeKanban([]);
    const nouvelle = screen.getByRole("button", {
      name: "Nouvelle carte dans la pile Sans valeur",
    });
    expect(arretsDeTabulation(plateau())).toEqual([nouvelle]);

    await utilisateur.tab();
    await utilisateur.tab();
    await utilisateur.tab();
    expect(document.activeElement).toBe(nouvelle);
    await utilisateur.keyboard("{Enter}");
    expect(emises).toHaveLength(1);
    expect(table.lire().lignes).toHaveLength(1);
    expect(screen.getByRole("textbox", { name: "Titre de la carte Sans titre" })).toBeDefined();
  });

  it("F-020-AC15 la pile voisine d'une carte déplacée est amenée à l'écran", async () => {
    const amenee = vi.fn();
    const originale = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = amenee;
    try {
      const { utilisateur } = rendreLeKanban(REPARTITION);
      carte("Écrire").focus();
      await utilisateur.keyboard(DROITE);
      expect(amenee).toHaveBeenCalled();
    } finally {
      Element.prototype.scrollIntoView = originale;
    }
  });
});

describe("geste au pointeur (F-020-AC9, AC12, AC28)", () => {
  let retirer: () => void;
  beforeEach(() => {
    retirer = bouchonnerLaMiseEnPage();
  });
  afterEach(() => retirer());

  it("F-020-AC12 F-020-AC9 lâcher une carte sur la moitié haute d'une carte d'une autre pile la place avant elle, par la fonction de déplacement : cellule puis ligne", async () => {
    const { table, contenu } = rendreLeKanban(REPARTITION);
    const depart = await glisserLaCarteDe("Sans statut", [220, 80]);
    // F-020-AC28 : pendant le geste, la carte ne porte en ligne que `transform`, sans transition.
    for (const rangee of document.querySelectorAll("li")) {
      expect(rangee.getAttribute("style") ?? "").toMatch(/^(transform:[^;]*;?)?$/);
    }
    expect(depart.isConnected).toBe(true);
    await lacherLaCarte(220, 80);

    expect(titresDeLaPile("À faire, 3 cartes")).toEqual(["Écrire", "Sans statut", "Relire"]);
    expect(titresDeLaPile("Sans valeur, 0 carte")).toEqual([]);
    const lue = table.lire();
    expect(lue.lignes.map(({ cellules }) => cellules[0])).toEqual([
      "Écrire",
      "Sans statut",
      "Relire",
      "Livrer",
    ]);
    expect(lue.lignes[1]?.cellules[1]).toBe(contenu.options[0]);
  });

  it("F-020-AC21 F-020-AC12 pendant le geste, la pile survolée porte son repère et une carte survolée un trait avant ou après elle, rendus par la vue", async () => {
    rendreLeKanban(REPARTITION);
    const trait = (classes: string) =>
      document.querySelectorAll(`.${classes.split(" ").join(".")}`);

    // Pile vide survolée : la pile elle-même.
    await glisserLaCarteDe("Écrire", [420, 300]);
    expect(screen.getByRole("group", { name: "En cours, 0 carte" }).className).toBe(
      KANBAN.pileSurvolee,
    );
    expect(screen.getByRole("group", { name: "À faire, 2 cartes" }).className).toBe(KANBAN.pile);
    expect(trait(KANBAN.depotAvant)).toHaveLength(0);

    // Moitié haute de « Livrer » : un trait avant elle, dans sa rangée ; aucune pile survolée.
    await glisserLaCarteDe("Écrire", [620, 40]);
    const livrer = carte("Livrer").closest("li");
    expect(livrer?.querySelector(`.${KANBAN.depotAvant.split(" ").join(".")}`)).not.toBeNull();
    expect(trait(KANBAN.depotApres)).toHaveLength(0);
    expect(screen.getByRole("group", { name: "Fait, 1 carte" }).className).toBe(KANBAN.pile);

    // Moitié basse : un trait après elle.
    await glisserLaCarteDe("Écrire", [620, 60]);
    expect(livrer?.querySelector(`.${KANBAN.depotApres.split(" ").join(".")}`)).not.toBeNull();
    expect(trait(KANBAN.depotAvant)).toHaveLength(0);
    await abandonnerLeGeste();
    expect(trait(KANBAN.depotApres)).toHaveLength(0);
  });

  it("F-020-AC12 sur une pile non vide visée elle-même, le repère est un trait après la dernière carte (là où la carte sera posée), pas un contour de la pile", async () => {
    const { table } = rendreLeKanban(REPARTITION);
    // Sous les cartes de « À faire » : la pile elle-même est visée, la carte part en fin de pile.
    await glisserLaCarteDe("Livrer", [220, 300]);
    const piledAFaire = screen.getByRole("group", { name: "À faire, 2 cartes" });
    expect(piledAFaire.className).toBe(KANBAN.pile);
    const fin = piledAFaire.querySelector(`.${KANBAN.depotFin.split(" ").join(".")}`);
    expect(fin).not.toBeNull();
    // Le trait suit la liste des cartes : il est après la dernière.
    expect(piledAFaire.querySelector("ul")?.compareDocumentPosition(fin as Node) ?? 0).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    await lacherLaCarte(220, 300);
    expect(titresDeLaPile("À faire, 3 cartes")).toEqual(["Écrire", "Relire", "Livrer"]);
    expect(table.lire().lignes).toHaveLength(4);
    expect(document.querySelector(`.${KANBAN.depotFin.split(" ").join(".")}`)).toBeNull();
  });

  it("F-020-AC12 lâcher sur une pile vide, ou sous les cartes d'une pile, pose la carte en fin de pile", async () => {
    const { table } = rendreLeKanban(REPARTITION);
    await glisserLaCarteDe("Écrire", [420, 300]);
    await lacherLaCarte(420, 300);
    expect(titresDeLaPile("En cours, 1 carte")).toEqual(["Écrire"]);
    expect(table.lire().lignes).toHaveLength(4);
  });

  it("F-020-AC12 Échap ou un lâcher hors de toute pile abandonne le geste sans rien écrire", async () => {
    const { emises } = rendreLeKanban(REPARTITION);
    await glisserLaCarteDe("Écrire", [420, 300]);
    await abandonnerLeGeste();
    await lacherLaCarte(420, 300);
    expect(emises).toHaveLength(0);
    expect(titresDeLaPile("En cours, 0 carte")).toEqual([]);

    await glisserLaCarteDe("Écrire", [900, 300]);
    await lacherLaCarte(900, 300);
    expect(emises).toHaveLength(0);
    // Un abandon n'est pas un refus : aucune alerte n'est affichée.
    expect(alertes()).toBe("");
  });

  it("F-020-AC12 la carte glissée supprimée par une mise à jour reçue pendant le geste : le lâcher n'écrit rien", async () => {
    const { table, contenu, emises } = rendreLeKanban(REPARTITION);
    await glisserLaCarteDe("Écrire", [420, 300]);
    const avant = emises.length;
    const ligne = contenu.lignes.get("Écrire") ?? "";
    act(() => table.supprimerLigne(ligne));
    const apres = emises.length;
    expect(apres).toBeGreaterThan(avant);
    await lacherLaCarte(420, 300);
    expect(emises).toHaveLength(apres);
    expect(nomsDesPiles()).toContain("En cours, 0 carte");
    expect(alertes()).toBe("");
  });

  it("F-020-AC12 la pile survolée retirée par une mise à jour reçue pendant le geste : le lâcher n'écrit rien", async () => {
    const { table, contenu, emises } = rendreLeKanban(REPARTITION);
    await glisserLaCarteDe("Écrire", [620, 300]);
    const avant = emises.length;
    act(() => table.retirerOption(contenu.statut, contenu.options[2] ?? ""));
    const apres = emises.length;
    expect(apres).toBeGreaterThan(avant);
    expect(nomsDesPiles().some((nom) => nom.startsWith("Fait"))).toBe(false);
    await lacherLaCarte(620, 300);
    expect(emises).toHaveLength(apres);
    expect(titresDeLaPile("À faire, 2 cartes")).toContain("Écrire");
    expect(alertes()).toBe("");
  });

  it("F-020-AC21 F-020-AC12 lâcher une carte sur sa propre place la laisse en place, l'annonce le dit (et non un abandon) et rien n'est écrit", async () => {
    const { emises } = rendreLeKanban(REPARTITION);
    await glisserLaCarteDe("Écrire", [230, 50]);
    await lacherLaCarte(230, 50);
    expect(emises).toHaveLength(0);
    expect(titresDeLaPile("À faire, 2 cartes")).toEqual(["Écrire", "Relire"]);
    const dits = document.body.textContent ?? "";
    expect(dits).toContain("Écrire laissée à sa place, pile À faire.");
    expect(dits).not.toContain("déplacement abandonné");
  });

  it("F-020-AC12 F-020-AC25 pendant la saisie d'un titre, aucun geste ne démarre", async () => {
    const { utilisateur, emises } = rendreLeKanban(REPARTITION);
    carte("Écrire").focus();
    await utilisateur.keyboard("{Enter}");
    expect(screen.getByRole("textbox")).toBeDefined();
    await glisserLaCarteDe("Livrer", [420, 300]);
    await lacherLaCarte(420, 300);
    expect(emises).toHaveLength(0);
  });
});

// La région d'annonces du module de glisser-déposer, distincte de la zone d'annonce de la vue.
function annonceDuGeste(): string {
  return document.querySelector("[aria-live='assertive']")?.textContent ?? "";
}

describe("annonces du geste, en français (F-020-AC21)", () => {
  let retirer: () => void;
  beforeEach(() => {
    retirer = bouchonnerLaMiseEnPage();
  });
  afterEach(() => retirer());

  it("F-020-AC21 la saisie, le survol d'une carte, le survol d'une pile et le dépôt nomment la carte et la pile ; Échap le dit", async () => {
    rendreLeKanban(REPARTITION);
    await saisirLaCarteDe("Sans statut", [905, 300], [900, 300]);
    expect(annonceDuGeste()).toBe("Sans statut, pile Sans valeur, 1 sur 1. Carte saisie.");
    await abandonnerLeGeste();

    // Moitié haute de « Relire », deuxième carte de « À faire » : avant elle.
    await glisserLaCarteDe("Sans statut", [220, 80]);
    expect(annonceDuGeste()).toBe("Sans statut : avant la carte Relire, pile À faire.");
    // Moitié basse de « Écrire » : après elle.
    await glisserLaCarteDe("Sans statut", [220, 60]);
    expect(annonceDuGeste()).toBe("Sans statut : après la carte Écrire, pile À faire.");
    // Sous les cartes de « En cours », pile vide : la pile elle-même.
    await glisserLaCarteDe("Sans statut", [420, 300]);
    expect(annonceDuGeste()).toBe("Sans statut : dans la pile En cours.");

    await lacherLaCarte(420, 300);
    expect(annonceDuGeste()).toBe("Sans statut déposée dans la pile En cours.");
    expect(titresDeLaPile("En cours, 1 carte")).toEqual(["Sans statut"]);

    await glisserLaCarteDe("Écrire", [420, 300]);
    await abandonnerLeGeste();
    expect(annonceDuGeste()).toBe(
      "Déplacement de la carte Écrire abandonné, la carte reste dans la pile À faire.",
    );
  });

  it("F-020-AC21 la vraie carte du kanban ne porte ni `aria-roledescription` ni aucun texte par défaut de la bibliothèque, ni pendant le geste ni après", async () => {
    rendreLeKanban(REPARTITION);
    const textesDe = (titre: string): string[] => {
      const rangee = carte(titre).closest("li") as HTMLElement;
      return [rangee, carte(titre)].flatMap((element) =>
        [...element.attributes].map((attribut) => attribut.value),
      );
    };
    const parDefaut =
      /draggable|droppable|space bar|arrow keys|press escape|picked up|was moved|was dropped|cancelled|sortable/i;
    const verifier = (): void => {
      for (const titre of ["Écrire", "Livrer"]) {
        const rangee = carte(titre).closest("li") as HTMLElement;
        expect(rangee.hasAttribute("aria-roledescription")).toBe(false);
        expect(carte(titre).hasAttribute("aria-roledescription")).toBe(false);
        expect(textesDe(titre).filter((texte) => parDefaut.test(texte))).toEqual([]);
      }
      const regions = [
        ...document.querySelectorAll("[id^='DndDescribedBy'], [id^='DndLiveRegion']"),
      ];
      expect(
        regions.map((region) => region.textContent ?? "").filter((t) => parDefaut.test(t)),
      ).toEqual([]);
    };
    verifier();
    await glisserLaCarteDe("Écrire", [620, 60]);
    verifier();
    await lacherLaCarte(620, 60);
    verifier();
  });

  it("F-020-AC21 lâcher hors de toute pile le dit, et une carte lâchée sur sa place y reste", async () => {
    rendreLeKanban(REPARTITION);
    await glisserLaCarteDe("Écrire", [900, 300]);
    await lacherLaCarte(900, 300);
    expect(annonceDuGeste()).toBe(
      "Écrire relâchée hors d'une pile : déplacement abandonné, la carte reste dans la pile À faire.",
    );
  });

  it("F-020-AC21 le texte d'instructions lu avec chaque carte est en français et dit les touches, la tabulation et la souris", () => {
    rendreLeKanban(REPARTITION);
    const instructions = document.getElementById(
      carte("Écrire").getAttribute("aria-describedby") ?? "",
    )?.textContent;
    expect(instructions).toContain("Pour déplacer une carte au clavier");
    expect(instructions).toContain("Alt+Maj+←");
    expect(instructions).toContain("Alt+Maj+↑");
    expect(instructions).toContain("Tab entre dans le plateau et en sort");
    expect(instructions).toContain("« Nouvelle carte »");
    expect(instructions).toContain("« Afficher 100 cartes de plus »");
    expect(instructions).toContain("Échap abandonne le geste");
  });
});

describe("noms accessibles et texte brut (F-020-AC21, AC22)", () => {
  it("F-020-AC21 chaque pile est un groupe nommé par son libellé et son nombre de cartes ; le repère de dépôt n'est pas qu'une couleur", () => {
    rendreLeKanban(REPARTITION);
    expect(nomsDesPiles()).toEqual([
      "Sans valeur, 1 carte",
      "À faire, 2 cartes",
      "En cours, 0 carte",
      "Fait, 1 carte",
    ]);
    // La pile survolée ajoute un contour de dépôt à sa teinte (F-006 : repère non chromatique).
    expect(KANBAN.pileSurvolee).toContain("contour-de-depot");
    expect(KANBAN.pile).not.toContain("contour-de-depot");
    expect(KANBAN.depotAvant).toContain("h-repere");
  });

  it("F-020-AC22 un titre, un libellé d'option et un nom de colonne qui contiennent du balisage sont du texte : cartes, en-têtes, noms accessibles et annonces", async () => {
    const titre = "<img src=x onerror=alert(1)> <b>gras</b>";
    const option = "<script>alert(2)</script>";
    const { utilisateur, contenu, table } = rendreLeKanban([[titre, 0]], {
      libelles: [option, "Fait"],
      remplir: ({ table: ouverte, statut }) => ouverte.renommerColonne(statut, "<i>Statut</i>"),
    });
    expect(table.lire().colonnes).toHaveLength(2);
    expect(contenu.lignes.size).toBe(1);
    expect(document.querySelector("img, b, i, script")).toBeNull();
    expect(carte(titre).textContent).toContain(titre);
    expect(nomsDesPiles()[1]).toBe(`${option}, 1 carte`);
    expect(
      screen.getByRole("group", { name: /Kanban de la table Budget, regroupé par <i>Statut<\/i>/ }),
    ).toBeDefined();

    carte(titre).focus();
    await utilisateur.keyboard(DROITE);
    expect(annonceDeLaVue()).toBe(`${titre}, pile Fait, 1 sur 1.`);
    expect(document.querySelector("img, b, i, script")).toBeNull();
    expect(screen.getByRole("button", { name: `Actions de la carte ${titre}` })).toBeDefined();
  });
});

describe("écriture refusée pendant un déplacement (F-020-AC20)", () => {
  // « A » passe dans la pile « En cours » : sa cellule change, puis sa ligne se place après « B ».
  const DEUX_ECRITURES = [
    ["A", 0],
    ["B", 1],
    ["C", 0],
  ] as const;

  it("F-020-AC20 la cellule refusée (option disparue) : un message en français, la ligne n'est pas déplacée, les piles sont relues et la vue reste utilisable", async () => {
    const { utilisateur, table, contenu, emises } = rendreLeKanban(DEUX_ECRITURES);
    vi.spyOn(table, "ecrireCellule").mockImplementationOnce(() => {
      throw new ErreurDocument("option-introuvable", "option introuvable");
    });
    const deplacer = vi.spyOn(table, "deplacerLigne");
    carte("A").focus();
    await utilisateur.keyboard(DROITE);

    expect(alertes()).toBe(
      "Ce choix n'existe plus dans la colonne : l'action n'a pas été effectuée.",
    );
    expect(deplacer).not.toHaveBeenCalled();
    expect(emises).toHaveLength(0);
    // La vue est conforme à la table lue.
    expect(titresDeLaPile("À faire, 2 cartes")).toEqual(["A", "C"]);
    expect(titresDeLaPile("En cours, 1 carte")).toEqual(["B"]);

    // Rester utilisable : la même commande, le document redevenu libre, aboutit.
    await utilisateur.keyboard(DROITE);
    expect(titresDeLaPile("En cours, 2 cartes")).toEqual(["B", "A"]);
    expect(alertes()).toBe("");
    expect(table.lire().lignes.map(({ cellules }) => cellules[0])).toEqual(["B", "A", "C"]);
    expect(table.lire().lignes.find(({ cellules }) => cellules[0] === "A")?.cellules[1]).toBe(
      contenu.options[1],
    );
  });

  it("F-020-AC20 la ligne refusée après l'écriture de la cellule : le message est dit et les piles relues disent ce que la table porte", async () => {
    const { utilisateur, table } = rendreLeKanban(DEUX_ECRITURES);
    const deplacer = vi.spyOn(table, "deplacerLigne").mockImplementationOnce(() => {
      throw new ErreurDocument("ligne-introuvable", "ligne introuvable");
    });
    carte("A").focus();
    await utilisateur.keyboard(DROITE);

    expect(deplacer).toHaveBeenCalledTimes(1);
    expect(alertes()).toBe("Cette ligne n'existe plus : l'action n'a pas été effectuée.");
    expect(table.lire().lignes.map(({ cellules }) => cellules[0])).toEqual(["A", "B", "C"]);
    // La cellule a été écrite avant le refus : la vue la lit, sans carte dupliquée ni perdue.
    expect(titresDeLaPile("En cours, 2 cartes")).toEqual(["A", "B"]);
    expect(titresDeLaPile("À faire, 1 carte")).toEqual(["C"]);
  });
});

describe("lecture seule (F-020-AC23)", () => {
  it("F-020-AC23 le geste, les quatre commandes, « Nouvelle carte », le titre et la suppression sont désactivés avec « Lecture seule » ; la navigation reste utilisable et l'état encodé du document ne change pas, octet pour octet", async () => {
    const { utilisateur, table, emises } = rendreLeKanban(REPARTITION, {
      lectureSeule: "Lecture seule",
      remplir: ({ table: ouverte }) => void ouverte.creerColonne("Autre", "selection"),
    });
    const avant = Y.encodeStateAsUpdate(table.doc);
    // La raison du blocage du geste est lue avec chaque carte, à la place des touches de déplacement.
    const decritePar = carte("Écrire").getAttribute("aria-describedby") ?? "";
    expect(document.getElementById(decritePar)?.textContent).toBe(
      "Lecture seule : les cartes ne peuvent pas être déplacées.",
    );
    const retirer = bouchonnerLaMiseEnPage();
    try {
      carte("Écrire").focus();
      await utilisateur.keyboard(DESCENDRE + DROITE + GAUCHE + MONTER);
      await utilisateur.keyboard("{Enter}");
      expect(screen.queryByRole("textbox")).toBeNull();
      await utilisateur.click(
        screen.getByRole("button", { name: "Nouvelle carte dans la pile À faire" }),
      );
      await glisserLaCarteDe("Livrer", [20, 80]);
      await lacherLaCarte(20, 80);
      carte("Écrire").focus();
      await utilisateur.keyboard("{Shift>}{F10}{/Shift}");
      const menu = screen.getByRole("menu");
      for (const entree of within(menu).getAllByRole("menuitem")) {
        fireEvent.click(entree);
      }
    } finally {
      retirer();
    }
    expect(emises).toHaveLength(0);
    expect(Buffer.from(Y.encodeStateAsUpdate(table.doc)).equals(Buffer.from(avant))).toBe(true);

    // Chaque commande est désactivée et dit pourquoi : « Nouvelle carte », puis les entrées du menu.
    const nouvelle = screen.getByRole("button", { name: "Nouvelle carte dans la pile À faire" });
    expect((nouvelle as HTMLButtonElement).disabled).toBe(true);
    const idRaison = nouvelle.getAttribute("aria-describedby") ?? "";
    expect(document.getElementById(idRaison)?.textContent).toBe("Lecture seule");
    // Le menu ouvert plus haut est toujours là : ses entrées restent désactivées.
    const entrees = within(screen.getByRole("menu")).getAllByRole("menuitem");
    expect(entrees).toHaveLength(6);
    for (const entree of entrees) {
      const desactivee =
        (entree as HTMLButtonElement).disabled || entree.getAttribute("aria-disabled") === "true";
      expect(desactivee).toBe(true);
      const decrit = entree.getAttribute("aria-describedby") ?? "";
      expect(document.getElementById(decrit)?.textContent).toBe("Lecture seule");
    }
    await utilisateur.keyboard("{Escape}");
    // Une commande au clavier n'écrit rien et l'alerte dit « Lecture seule ».
    carte("Écrire").focus();
    await utilisateur.keyboard(DESCENDRE);
    expect(screen.getByRole("alert").textContent).toContain("Lecture seule");
    expect(emises).toHaveLength(0);

    // La navigation et « Regrouper par » restent utilisables ; « Nouvelle carte », désactivée, n'est pas
    // un arrêt : la carte reste l'arrêt unique de la vue.
    expect(arretsDeTabulation(plateau())).toHaveLength(1);
    carte("Écrire").focus();
    await utilisateur.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(carte("Relire"));
    const regrouper = screen.getByRole("combobox", { name: "Regrouper par" });
    expect((regrouper as HTMLSelectElement).disabled).toBe(false);
  });
});

describe("témoin du geste hors lecture seule (F-020-AC23)", () => {
  it("F-020-AC23 le geste qu'on tente en lecture seule, répété hors lecture seule, déplace bien la carte : la lecture seule est ce qui l'empêche", async () => {
    const retirer = bouchonnerLaMiseEnPage();
    try {
      const { table, emises } = rendreLeKanban(REPARTITION);
      await glisserLaCarteDe("Livrer", [20, 80]);
      await lacherLaCarte(20, 80);
      expect(titresDeLaPile("Sans valeur, 2 cartes")).toEqual(["Sans statut", "Livrer"]);
      expect(emises.length).toBeGreaterThan(0);
      expect(table.lire().lignes).toHaveLength(4);
    } finally {
      retirer();
    }
  });
});

describe("aucune requête réseau (F-020-AC24)", () => {
  it("F-020-AC24 un déplacement, une création et un choix de regroupement n'émettent aucune requête, réseau coupé", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("réseau coupé"));
    const socket = vi.fn();
    vi.stubGlobal("WebSocket", socket);
    const beacon = vi.fn();
    Object.defineProperty(navigator, "sendBeacon", { configurable: true, value: beacon });
    const enLigne = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    try {
      const { utilisateur } = rendreLeKanban(REPARTITION);
      carte("Écrire").focus();
      await utilisateur.keyboard(DROITE);
      await utilisateur.click(
        screen.getByRole("button", { name: "Nouvelle carte dans la pile Fait" }),
      );
      expect(titresDeLaPile("En cours, 1 carte")).toEqual(["Écrire"]);
      expect(fetch).not.toHaveBeenCalled();
      expect(socket).not.toHaveBeenCalled();
      expect(beacon).not.toHaveBeenCalled();
    } finally {
      enLigne.mockRestore();
      fetch.mockRestore();
      vi.unstubAllGlobals();
      Reflect.deleteProperty(navigator, "sendBeacon");
    }
  });
});
