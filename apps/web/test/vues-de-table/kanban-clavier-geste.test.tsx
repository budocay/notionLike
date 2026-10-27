// Vue kanban rendue par l'écran de table : clavier, geste au pointeur, noms accessibles, texte brut,
// lecture seule, réseau (F-020-AC9, AC12, AC13, AC15, AC21, AC22, AC23, AC24, AC28). Le geste passe
// par le module de glisser-déposer réel sous jsdom, avec une mise en page bouchonnée (H6, H11) ; le
// geste de la souris dans un vrai navigateur est éprouvé par `e2e/kanban.spec.ts`.
import { act, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

import { KANBAN } from "../../src/interface/composants/kanban.classes.ts";
import {
  annonceDeLaVue,
  bouchonnerLaMiseEnPage,
  carte,
  cartes,
  nomsDesPiles,
  rendreLeKanban,
  titresDeLaPile,
} from "./aides-ecran-kanban.tsx";

const REPARTITION = [
  ["Écrire", 0],
  ["Relire", 0],
  ["Sans statut", -1],
  ["Livrer", 2],
] as const;

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

  it("F-020-AC15 les flèches déplacent le focus de carte en carte et de pile en pile sans rien écrire ; un seul arrêt de tabulation parmi les cartes", async () => {
    const { utilisateur, emises } = rendreLeKanban(REPARTITION);
    expect(cartes().filter((une) => une.tabIndex === 0)).toHaveLength(1);

    carte("Sans statut").focus();
    await utilisateur.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(carte("Écrire"));
    await utilisateur.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(carte("Relire"));
    await utilisateur.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(carte("Livrer"));
    await utilisateur.keyboard("{ArrowLeft}{ArrowUp}");
    expect(document.activeElement).toBe(carte("Écrire"));

    expect(emises).toHaveLength(0);
    expect(cartes().filter((une) => une.tabIndex === 0)).toEqual([carte("Écrire")]);
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

  const attendre = () => act(() => new Promise<void>((suite) => setTimeout(suite, 40)));
  function evenement(type: string, x: number, y: number): PointerEvent {
    return new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
      button: 0,
      pointerId: 1,
      isPrimary: true,
    });
  }
  async function glisser(titre: string, ...points: readonly (readonly [number, number])[]) {
    const depart = carte(titre).closest("li") as HTMLElement;
    await act(async () => {
      depart.dispatchEvent(evenement("pointerdown", 10, 40));
    });
    for (const [x, y] of [[20, 40] as const, ...points]) {
      await act(async () => {
        document.dispatchEvent(evenement("pointermove", x, y));
      });
      await attendre();
    }
    return depart;
  }
  async function lacher(x: number, y: number) {
    await act(async () => {
      document.dispatchEvent(evenement("pointerup", x, y));
    });
    await attendre();
  }

  it("F-020-AC12 F-020-AC9 lâcher une carte sur la moitié haute d'une carte d'une autre pile la place avant elle, par la fonction de déplacement : cellule puis ligne", async () => {
    const { table, contenu } = rendreLeKanban(REPARTITION);
    const depart = await glisser("Sans statut", [220, 80]);
    // F-020-AC28 : pendant le geste, la carte ne porte en ligne que `transform`, sans transition.
    for (const rangee of document.querySelectorAll("li")) {
      expect(rangee.getAttribute("style") ?? "").toMatch(/^(transform:[^;]*;?)?$/);
    }
    expect(depart.isConnected).toBe(true);
    await lacher(220, 80);

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

  it("F-020-AC12 lâcher sur une pile vide, ou sous les cartes d'une pile, pose la carte en fin de pile", async () => {
    const { table } = rendreLeKanban(REPARTITION);
    await glisser("Écrire", [420, 300]);
    await lacher(420, 300);
    expect(titresDeLaPile("En cours, 1 carte")).toEqual(["Écrire"]);
    expect(table.lire().lignes).toHaveLength(4);
  });

  it("F-020-AC12 Échap ou un lâcher hors de toute pile abandonne le geste sans rien écrire", async () => {
    const { emises } = rendreLeKanban(REPARTITION);
    await glisser("Écrire", [420, 300]);
    await act(async () => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }),
      );
    });
    await attendre();
    await lacher(420, 300);
    expect(emises).toHaveLength(0);
    expect(titresDeLaPile("En cours, 0 carte")).toEqual([]);

    await glisser("Écrire", [900, 300]);
    await lacher(900, 300);
    expect(emises).toHaveLength(0);
  });

  it("F-020-AC12 la carte glissée supprimée par une mise à jour reçue pendant le geste : le lâcher n'écrit rien", async () => {
    const { table, contenu, emises } = rendreLeKanban(REPARTITION);
    await glisser("Écrire", [420, 300]);
    const avant = emises.length;
    const ligne = contenu.lignes.get("Écrire") ?? "";
    act(() => table.supprimerLigne(ligne));
    const apres = emises.length;
    expect(apres).toBeGreaterThan(avant);
    await lacher(420, 300);
    expect(emises).toHaveLength(apres);
    expect(nomsDesPiles()).toContain("En cours, 0 carte");
  });

  it("F-020-AC12 la pile survolée retirée par une mise à jour reçue pendant le geste : le lâcher n'écrit rien", async () => {
    const { table, contenu, emises } = rendreLeKanban(REPARTITION);
    await glisser("Écrire", [620, 300]);
    const avant = emises.length;
    act(() => table.retirerOption(contenu.statut, contenu.options[2] ?? ""));
    const apres = emises.length;
    expect(apres).toBeGreaterThan(avant);
    expect(nomsDesPiles().some((nom) => nom.startsWith("Fait"))).toBe(false);
    await lacher(620, 300);
    expect(emises).toHaveLength(apres);
    expect(titresDeLaPile("À faire, 2 cartes")).toContain("Écrire");
  });

  it("F-020-AC21 F-020-AC12 lâcher une carte sur sa propre place la laisse en place, l'annonce le dit (et non un abandon) et rien n'est écrit", async () => {
    const { emises } = rendreLeKanban(REPARTITION);
    await glisser("Écrire", [230, 50]);
    await lacher(230, 50);
    expect(emises).toHaveLength(0);
    expect(titresDeLaPile("À faire, 2 cartes")).toEqual(["Écrire", "Relire"]);
    const dits = document.body.textContent ?? "";
    expect(dits).toContain("Écrire laissée à sa place.");
    expect(dits).not.toContain("déplacement abandonné");
  });

  it("F-020-AC12 F-020-AC25 pendant la saisie d'un titre, aucun geste ne démarre", async () => {
    const { utilisateur, emises } = rendreLeKanban(REPARTITION);
    carte("Écrire").focus();
    await utilisateur.keyboard("{Enter}");
    expect(screen.getByRole("textbox")).toBeDefined();
    await glisser("Livrer", [420, 300]);
    await lacher(420, 300);
    expect(emises).toHaveLength(0);
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

describe("lecture seule (F-020-AC23)", () => {
  it("F-020-AC23 le geste, les quatre commandes, « Nouvelle carte », le titre et la suppression sont désactivés avec « Lecture seule » ; la navigation reste utilisable et l'état encodé du document ne change pas, octet pour octet", async () => {
    const { utilisateur, table, emises } = rendreLeKanban(REPARTITION, {
      lectureSeule: "Lecture seule",
      remplir: ({ table: ouverte }) => void ouverte.creerColonne("Autre", "selection"),
    });
    const avant = Y.encodeStateAsUpdate(table.doc);
    const retirer = bouchonnerLaMiseEnPage();
    try {
      carte("Écrire").focus();
      await utilisateur.keyboard(DESCENDRE + DROITE + GAUCHE + MONTER);
      await utilisateur.keyboard("{Enter}");
      expect(screen.queryByRole("textbox")).toBeNull();
      await utilisateur.click(
        screen.getByRole("button", { name: "Nouvelle carte dans la pile À faire" }),
      );
      await act(async () => {
        const depart = carte("Livrer").closest("li") as HTMLElement;
        for (const [type, x, y] of [
          ["pointerdown", 410, 40],
          ["pointermove", 420, 40],
          ["pointermove", 20, 80],
          ["pointerup", 20, 80],
        ] as const) {
          (type === "pointerdown" ? depart : document).dispatchEvent(
            new PointerEvent(type, {
              bubbles: true,
              clientX: x,
              clientY: y,
              pointerId: 1,
              button: 0,
            }),
          );
        }
      });
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

    // La navigation et « Regrouper par » restent utilisables.
    carte("Écrire").focus();
    await utilisateur.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(carte("Relire"));
    const regrouper = screen.getByRole("combobox", { name: "Regrouper par" });
    expect((regrouper as HTMLSelectElement).disabled).toBe(false);
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
