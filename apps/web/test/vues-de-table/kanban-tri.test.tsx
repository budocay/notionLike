// Vue kanban sous un tri et sous des filtres de F-019 (F-020-AC16) : « Monter » et « Descendre »
// indisponibles avec « Tri actif », un seul repère de dépôt par pile, déplacement réduit au
// changement de pile sans rien déplacer dans la table, et affichage figé de F-019-AC17 qui suit un
// déplacement de carte. La table est rendue par l'écran de table, la définition enregistrée sur
// l'appareil comme F-019 la garde.
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { KANBAN } from "../../src/interface/composants/kanban.classes.ts";
import { voisineDuDeplacement } from "../../src/vues-de-table/kanban/destination.ts";
import {
  annonceDeLaVue,
  bouchonnerLaMiseEnPage,
  carte,
  CLE_DES_REGLAGES,
  glisserLaCarteDe,
  lacherLaCarte,
  nomsDesPiles,
  pile,
  rendreLeKanban,
  titresDeLaPile,
} from "./aides-ecran-kanban.tsx";
import type { TableDeKanban } from "./aides-kanban.ts";

const REPARTITION = [
  ["Écrire", 0],
  ["Relire", 0],
  ["Livrer", 2],
  ["Sans statut", -1],
] as const;

const DESCENDRE = "{Alt>}{Shift>}{ArrowDown}{/Shift}{/Alt}";
const MONTER = "{Alt>}{Shift>}{ArrowUp}{/Shift}{/Alt}";
const DROITE = "{Alt>}{Shift>}{ArrowRight}{/Shift}{/Alt}";

/** Enregistre la définition de vue de l'appareil, la vue « Kanban » active. */
function definir(definition: Record<string, unknown>): void {
  localStorage.setItem(
    CLE_DES_REGLAGES,
    JSON.stringify({
      version: 1,
      sections: { vue: { active: "kanban" }, "filtres-tris": definition },
    }),
  );
}

// Titres croissants : Écrire, Livrer, Relire, Sans statut.
function triParTitre({ titre }: TableDeKanban): void {
  definir({ tris: [{ colonne: titre, sens: "croissant" }] });
}

function ordreDesLignes(table: {
  lire: () => { lignes: readonly { cellules: readonly unknown[] }[] };
}) {
  return table.lire().lignes.map(({ cellules }) => cellules[0]);
}

describe("sous un tri actif (F-020-AC16)", () => {
  it("F-020-AC16 les piles suivent l'ordre du tri ; au clavier « Monter » et « Descendre » disent « Tri actif » et n'écrivent rien", async () => {
    const { utilisateur, emises, table } = rendreLeKanban(REPARTITION, { remplir: triParTitre });
    const avant = ordreDesLignes(table);
    expect(titresDeLaPile("À faire, 2 cartes")).toEqual(["Écrire", "Relire"]);

    carte("Relire").focus();
    await utilisateur.keyboard(MONTER);
    expect(annonceDeLaVue()).toBe("Tri actif");
    carte("Écrire").focus();
    await utilisateur.keyboard(DESCENDRE);
    // Une annonce identique est vidée puis réécrite après un instant (use-annonce).
    await waitFor(() => expect(annonceDeLaVue()).toBe("Tri actif"));
    expect(emises).toHaveLength(0);
    expect(ordreDesLignes(table)).toEqual(avant);
    expect(titresDeLaPile("À faire, 2 cartes")).toEqual(["Écrire", "Relire"]);
  });

  it("F-020-AC16 le menu des actions expose « Monter » et « Descendre » indisponibles avec la raison « Tri actif » ; les commandes de pile restent offertes", async () => {
    const { utilisateur, emises } = rendreLeKanban(REPARTITION, { remplir: triParTitre });
    carte("Relire").focus();
    await utilisateur.keyboard("{Shift>}{F10}{/Shift}");
    const menu = screen.getByRole("menu", { name: "Actions de la carte Relire" });
    for (const commande of ["Monter", "Descendre"]) {
      const entree = within(menu).getByRole("menuitem", {
        name: `${commande} pour la carte Relire`,
      });
      expect(entree.hasAttribute("disabled")).toBe(true);
      fireEvent.click(entree);
    }
    expect(within(menu).getAllByText("Tri actif")).toHaveLength(2);
    expect(emises).toHaveLength(0);
    const suivante = within(menu).getByRole("menuitem", {
      name: "Pile suivante pour la carte Relire",
    });
    expect(suivante.hasAttribute("disabled")).toBe(false);
  });

  it("F-020-AC16 changer de pile écrit la cellule seule : la ligne ne bouge pas dans la table, et la carte prend la place du tri", async () => {
    const { utilisateur, table, contenu } = rendreLeKanban(REPARTITION, { remplir: triParTitre });
    const avant = ordreDesLignes(table);
    carte("Relire").focus();
    await utilisateur.keyboard(DROITE);

    expect(ordreDesLignes(table)).toEqual(avant);
    const relire = table.lire().lignes.find(({ cellules }) => cellules[0] === "Relire");
    expect(relire?.cellules[1]).toBe(contenu.options[1]);
    expect(titresDeLaPile("En cours, 1 carte")).toEqual(["Relire"]);
    expect(document.activeElement).toBe(carte("Relire"));
    expect(annonceDeLaVue()).toBe("Relire, pile En cours, 1 sur 1.");
  });
});

describe("la place annoncée sous un tri, sur une pile de plusieurs cartes (F-020-AC15, F-020-AC16)", () => {
  it("F-020-AC15 F-020-AC16 le rang annoncé est celui du tri (2 sur 3), pas celui de l'ordre manuel (3 sur 3)", async () => {
    // Ordre manuel : Delta, Bravo, Charlie. Tri croissant : Bravo, Charlie, Delta.
    const { utilisateur, table } = rendreLeKanban(
      [
        ["Delta", 1],
        ["Bravo", 1],
        ["Charlie", 0],
      ],
      { remplir: triParTitre },
    );
    const avant = ordreDesLignes(table);
    carte("Charlie").focus();
    await utilisateur.keyboard(DROITE);

    expect(ordreDesLignes(table)).toEqual(avant);
    expect(titresDeLaPile("En cours, 3 cartes")).toEqual(["Bravo", "Charlie", "Delta"]);
    expect(annonceDeLaVue()).toBe("Charlie, pile En cours, 2 sur 3.");
  });

  it("F-020-AC15 F-020-AC16 le rang annoncé suit le tri (2 sur 4) quand l'ordre manuel donnerait 1 sur 4", async () => {
    // Ordre manuel : Charlie, Delta, Bravo, Echo. Tri croissant : Bravo, Charlie, Delta, Echo.
    const { utilisateur } = rendreLeKanban(
      [
        ["Charlie", 0],
        ["Delta", 1],
        ["Bravo", 1],
        ["Echo", 1],
      ],
      { remplir: triParTitre },
    );
    carte("Charlie").focus();
    await utilisateur.keyboard(DROITE);

    expect(titresDeLaPile("En cours, 4 cartes")).toEqual(["Bravo", "Charlie", "Delta", "Echo"]);
    expect(annonceDeLaVue()).toBe("Charlie, pile En cours, 2 sur 4.");
  });
});

describe("au pointeur sous un tri actif (F-020-AC16)", () => {
  let retirer: () => void;
  beforeEach(() => {
    retirer = bouchonnerLaMiseEnPage();
  });
  afterEach(() => retirer());

  it("F-020-AC16 survoler une carte ne montre qu'un repère de pile, jamais une place entre deux cartes ; lâcher pose la carte dans la pile sans déplacer la ligne", async () => {
    const { table, contenu } = rendreLeKanban(REPARTITION, { remplir: triParTitre });
    const avant = ordreDesLignes(table);
    // Moitié haute de « Relire » : sans tri, ce serait un repère « avant ».
    await glisserLaCarteDe("Sans statut", [220, 80]);
    expect(pile("À faire, 2 cartes").className).toBe(KANBAN.pileSurvolee);
    expect(document.querySelector(`.${KANBAN.depotAvant.split(" ").join(".")}`)).toBeNull();
    expect(document.querySelector(`.${KANBAN.depotApres.split(" ").join(".")}`)).toBeNull();
    await lacherLaCarte(220, 80);

    expect(ordreDesLignes(table)).toEqual(avant);
    expect(titresDeLaPile("À faire, 3 cartes")).toEqual(["Écrire", "Relire", "Sans statut"]);
    const posee = table.lire().lignes.find(({ cellules }) => cellules[0] === "Sans statut");
    expect(posee?.cellules[1]).toBe(contenu.options[0]);
  });

  it("F-020-AC16 lâcher une carte sur sa propre pile ne change rien : la place est celle du tri", async () => {
    const { emises } = rendreLeKanban(REPARTITION, { remplir: triParTitre });
    await glisserLaCarteDe("Écrire", [220, 80]);
    await lacherLaCarte(220, 80);
    expect(emises).toHaveLength(0);
    expect(titresDeLaPile("À faire, 2 cartes")).toEqual(["Écrire", "Relire"]);
  });
});

describe("sous des filtres (F-020-AC16, F-019-AC17)", () => {
  function filtrerSurAFaire({ statut, options }: TableDeKanban): void {
    definir({ filtres: [{ colonne: statut, operateur: "est", valeur: options[0] }] });
  }

  it("F-020-AC16 les destinations se calculent parmi les cartes affichées : la ligne masquée n'est pas une carte", () => {
    rendreLeKanban(REPARTITION, { remplir: filtrerSurAFaire });
    expect(nomsDesPiles()).toEqual([
      "Sans valeur, 0 carte",
      "À faire, 2 cartes",
      "En cours, 0 carte",
      "Fait, 0 carte",
    ]);
  });

  it("F-020-AC16 l'affichage figé suit un déplacement de carte : « Monter » puis « Pile suivante » sont vus, la carte déplacée reste affichée", async () => {
    const { utilisateur, table } = rendreLeKanban(REPARTITION, { remplir: filtrerSurAFaire });
    carte("Relire").focus();
    await utilisateur.keyboard(MONTER);
    // Sans `deplacee`, l'affichage figé garderait l'ordre d'avant et la pile ne changerait pas.
    expect(titresDeLaPile("À faire, 2 cartes")).toEqual(["Relire", "Écrire"]);
    expect(ordreDesLignes(table)).toEqual(["Relire", "Écrire", "Livrer", "Sans statut"]);

    await utilisateur.keyboard(DROITE);
    expect(titresDeLaPile("En cours, 1 carte")).toEqual(["Relire"]);
    expect(titresDeLaPile("À faire, 1 carte")).toEqual(["Écrire"]);
    expect(document.activeElement).toBe(carte("Relire"));
  });
});

describe("la ligne affichée dont la carte prend la place (F-020-AC16, F-019-AC17)", () => {
  // Même règle que la vue « Tableau » (`deplacerUneLigne`) : la ligne affichée qui occupe, avant le
  // déplacement, le rang final de la carte.
  it.each([
    ["vers le bas, après une carte", ["A", "c", "B", "C"], ["B"], "B", "B"],
    ["vers le haut, après une carte", ["A", "B", "c"], ["A"], "A", "B"],
    ["en tête d'une pile, vers le bas", ["c", "X", "F", "Y"], ["F"], null, "X"],
    ["en tête d'une pile, vers le haut", ["F", "X", "c"], ["F"], null, "F"],
    ["une pile sans autre carte", ["A", "c"], [], null, undefined],
    ["la carte reste où elle est", ["A", "c", "B"], ["A"], "A", undefined],
  ] as const)("%s", (_nom, affichees, cartesDeLaPile, precedente, attendue) => {
    expect(voisineDuDeplacement(affichees, "c", cartesDeLaPile, precedente)).toBe(attendue);
  });
});
