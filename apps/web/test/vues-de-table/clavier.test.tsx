// Clavier et accessibilité de la grille (F-018-AC33, AC34) : rôles et indices, un seul arrêt de
// tabulation, déplacements de cellule en cellule, entrée en mode édition, vidage.
import type { DocumentTable } from "@notionlike/document";
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  cellule,
  focus,
  grille,
  rangees,
  rendreLaTable,
  textesDesLignes,
} from "./aides-grille.tsx";

function cellulesDeLaGrille(): HTMLElement[] {
  return [
    ...grille().querySelectorAll<HTMLElement>(
      '[role="gridcell"], [role="columnheader"], [role="rowheader"]',
    ),
  ];
}

function quatreLignes(table: DocumentTable): void {
  const nom = table.creerColonne("Nom", "texte");
  const prix = table.creerColonne("Prix", "nombre");
  table.creerColonne("Fait", "case");
  for (const [texte, nombre] of [
    ["A", 1],
    ["B", 2],
    ["C", 3],
    ["D", 4],
  ] as const) {
    table.creerLigne(
      new Map<string, string | number>([
        [nom, texte],
        [prix, nombre],
      ]),
    );
  }
}

describe("rôles de la grille (F-018-AC34)", () => {
  it("F-018-AC34 grille, rangées, en-têtes de colonne et cellules ; nombre total de rangées et de colonnes, indice de chaque rangée", () => {
    rendreLaTable(quatreLignes);
    const laGrille = grille();
    expect(laGrille.getAttribute("aria-label")).toBe("Lignes de la table Budget");
    expect(laGrille.getAttribute("aria-rowcount")).toBe("5");
    expect(laGrille.getAttribute("aria-colcount")).toBe("4");
    expect(rangees().map((rangee) => rangee.getAttribute("aria-rowindex"))).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
    ]);
    expect(
      within(laGrille)
        .getAllByRole("columnheader")
        .map((enTete) => enTete.getAttribute("aria-label") ?? enTete.textContent),
    ).toEqual(["Actions des lignes", "Nom", "Prix", "Fait"]);
    expect(within(laGrille).getAllByRole("rowheader")).toHaveLength(4);
    expect(within(laGrille).getAllByRole("gridcell")).toHaveLength(12);
  });

  it("F-018-AC34 chaque commande d'en-tête et de ligne porte un nom qui cite la colonne ou la place de la ligne", () => {
    rendreLaTable(quatreLignes);
    for (const nom of [
      "Actions de la colonne Nom",
      "Actions de la colonne Prix",
      "Actions de la ligne 1",
      "Actions de la ligne 4",
    ]) {
      expect(screen.getByRole("button", { name: nom }).tabIndex).toBe(-1);
    }
    expect(screen.getByRole("checkbox", { name: "Fait, ligne 3" })).toBeDefined();
  });
});

describe("navigation de cellule en cellule (F-018-AC33)", () => {
  it("F-018-AC33 la grille ne compte que pour un arrêt de tabulation : Tab y entre, Tab en sort", async () => {
    const { utilisateur } = rendreLaTable(quatreLignes);
    const arrets = cellulesDeLaGrille().filter((element) => element.tabIndex === 0);
    expect(arrets).toHaveLength(1);
    // Avant la grille : les trois vues du sélecteur (Tableau, Kanban, Calendrier, F-021-AC30), « Ajouter une colonne »
    // et « Nouvelle ligne ».
    for (let arret = 0; arret < 5; arret += 1) {
      await utilisateur.tab();
    }
    await utilisateur.tab();
    expect(focus()).toBe(arrets[0]);
    await utilisateur.tab();
    expect(grille().contains(focus())).toBe(false);
  });

  it("F-018-AC33 flèches, Début, Fin, Mod+Début et Mod+Fin déplacent la cellule courante, sans sortir ni boucler ; elle seule a tabindex 0", async () => {
    const { utilisateur } = rendreLaTable(quatreLignes);
    cellule(2, 2).focus();
    const parcours: [number, number][] = [];
    const noter = (): void => {
      const courante = focus() as HTMLElement;
      parcours.push([
        Number(courante.closest('[role="row"]')?.getAttribute("aria-rowindex")),
        Number(courante.getAttribute("aria-colindex")),
      ]);
    };
    for (const touche of [
      "{ArrowRight}",
      "{ArrowDown}",
      "{End}",
      "{ArrowRight}",
      "{Home}",
      "{Control>}{End}{/Control}",
      "{ArrowDown}",
      "{Control>}{Home}{/Control}",
      "{ArrowUp}",
      "{ArrowUp}",
    ]) {
      await utilisateur.keyboard(touche);
      noter();
    }
    expect(parcours).toEqual([
      [2, 3],
      [3, 3],
      [3, 4],
      [3, 4],
      [3, 2],
      [5, 4],
      [5, 4],
      [2, 2],
      [1, 2],
      [1, 2],
    ]);
    expect(cellulesDeLaGrille().filter((element) => element.tabIndex === 0)).toEqual([focus()]);
  });

  it("F-018-AC33 Page suivante et Page précédente déplacent d'une hauteur de fenêtre, une rangée au moins", async () => {
    const { utilisateur } = rendreLaTable(quatreLignes);
    cellule(2, 2).focus();
    await utilisateur.keyboard("{PageDown}");
    expect(focus()).toBe(cellule(3, 2));
    await utilisateur.keyboard("{PageUp}{PageUp}");
    expect(focus()).toBe(cellule(2, 2));
  });

  it("F-018-AC33 Entrée et F2 entrent en mode édition ; en mode édition, Entrée valide et descend, Tab et Maj+Tab valident et passent à la cellule voisine", async () => {
    const { table, utilisateur } = rendreLaTable(quatreLignes);
    cellule(2, 2).focus();
    await utilisateur.keyboard("{Enter}");
    expect(focus()).toBe(screen.getByRole("textbox", { name: "Nom, ligne 1" }));
    await utilisateur.keyboard("1{Enter}");
    expect(focus()).toBe(cellule(3, 2));
    await utilisateur.keyboard("{F2}2{Tab}");
    expect(focus()).toBe(cellule(3, 3));
    await utilisateur.keyboard("{F2}{Shift>}{Tab}{/Shift}");
    expect(focus()).toBe(cellule(3, 2));
    expect(textesDesLignes().map(([texte]) => texte)).toEqual(["A1", "B2", "C", "D"]);
    expect(table.lire().lignes[1]?.cellules[1]).toBe(2);
  });

  it("F-018-AC33 Suppr et Retour arrière vident la cellule courante ; une frappe remplace le contenu d'une cellule nombre", async () => {
    const { table, utilisateur } = rendreLaTable(quatreLignes);
    cellule(2, 2).focus();
    await utilisateur.keyboard("{Delete}{ArrowRight}{Backspace}");
    expect(table.lire().lignes[0]?.cellules.slice(0, 2)).toEqual([null, null]);
    cellule(3, 3).focus();
    await utilisateur.keyboard("9{Enter}");
    expect(table.lire().lignes[1]?.cellules[1]).toBe(9);
  });
});
