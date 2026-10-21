// Lignes de la grille (F-018-AC23 à AC25) : création, déplacement par commande et par raccourci,
// suppression confirmée, chacune par une seule opération du document de table.
import type { DocumentTable } from "@notionlike/document";
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { cellule, focus, rendreLaTable, textesDesLignes } from "./aides-grille.tsx";

function troisLignes(table: DocumentTable): void {
  const nom = table.creerColonne("Nom", "texte");
  table.creerColonne("Prix", "nombre");
  for (const texte of ["Une", "Deux", "Trois"]) {
    table.creerLigne(new Map([[nom, texte]]));
  }
}

function premiers(): string[] {
  return textesDesLignes().map(([texte = ""]) => texte);
}

describe("nouvelle ligne (F-018-AC23)", () => {
  it("F-018-AC23 « Nouvelle ligne » crée une ligne sans valeur en dernière position par une seule opération et place le focus sur sa première cellule", async () => {
    const { table, utilisateur, emises } = rendreLaTable(troisLignes);
    await utilisateur.click(screen.getByRole("button", { name: "Nouvelle ligne" }));

    expect(emises).toHaveLength(1);
    expect(table.lire().lignes.at(-1)?.cellules).toEqual([null, null]);
    expect(focus()).toBe(cellule(5, 2));
    expect(premiers()).toEqual(["Une", "Deux", "Trois", ""]);
  });
});

describe("déplacer une ligne (F-018-AC24)", () => {
  it("F-018-AC24 Alt+Maj+Flèche bas sur une cellule descend la ligne d'une place, la cellule courante la suit, la place est annoncée", async () => {
    const { table, utilisateur, emises } = rendreLaTable(troisLignes);
    cellule(2, 3).focus();
    await utilisateur.keyboard("{Alt>}{Shift>}{ArrowDown}{/Shift}{/Alt}");

    expect(emises).toHaveLength(1);
    expect(premiers()).toEqual(["Deux", "Une", "Trois"]);
    expect(table.lire().lignes.map(({ cellules }) => cellules[0])).toEqual([
      "Deux",
      "Une",
      "Trois",
    ]);
    expect(focus()).toBe(cellule(3, 3));
    expect(screen.getByRole("status").textContent).toBe("Ligne déplacée en position 2 sur 3.");

    await utilisateur.keyboard("{Alt>}{Shift>}{ArrowUp}{/Shift}{/Alt}");
    expect(premiers()).toEqual(["Une", "Deux", "Trois"]);
    expect(focus()).toBe(cellule(2, 3));
  });

  it("F-018-AC24 la première ne monte pas, la dernière ne descend pas : commande et raccourci indisponibles, aucune mise à jour", async () => {
    const { utilisateur, emises } = rendreLaTable(troisLignes);
    cellule(2, 2).focus();
    expect(cellule(2, 2).getAttribute("aria-keyshortcuts")).toBe("Alt+Shift+ArrowDown");
    await utilisateur.keyboard("{Alt>}{Shift>}{ArrowUp}{/Shift}{/Alt}");
    expect(screen.getByRole("status").textContent).toBe("Déjà la première ligne.");
    cellule(4, 2).focus();
    expect(cellule(4, 2).getAttribute("aria-keyshortcuts")).toBe("Alt+Shift+ArrowUp");
    await utilisateur.keyboard("{Alt>}{Shift>}{ArrowDown}{/Shift}{/Alt}");
    expect(screen.getByRole("status").textContent).toBe("Déjà la dernière ligne.");

    await utilisateur.click(screen.getByRole("button", { name: "Actions de la ligne 1" }));
    const menu = await screen.findByRole("menu", { name: "Actions de la ligne 1" });
    const monter = within(menu).getByRole("menuitem", { name: "Monter la ligne 1" });
    expect(monter.hasAttribute("disabled")).toBe(true);
    expect(monter.getAttribute("aria-keyshortcuts")).toBe("Alt+Shift+ArrowUp");
    expect(emises).toEqual([]);
  });

  it("F-018-AC24 F-018-AC34 « Descendre la ligne » du menu de la ligne, au clavier seul depuis sa cellule d'actions", async () => {
    const { utilisateur } = rendreLaTable(troisLignes);
    cellule(3, 2).focus();
    await utilisateur.keyboard("{Home}{ArrowLeft}{Enter}");
    const menu = await screen.findByRole("menu", { name: "Actions de la ligne 2" });
    expect(focus()).toBe(within(menu).getByRole("menuitem", { name: "Monter la ligne 2" }));
    await utilisateur.keyboard("{ArrowDown}{Enter}");
    expect(premiers()).toEqual(["Une", "Trois", "Deux"]);
    expect(focus()).toBe(cellule(4, 1));
  });
});

describe("supprimer une ligne (F-018-AC25)", () => {
  async function demander(
    utilisateur: ReturnType<typeof rendreLaTable>["utilisateur"],
    rang: number,
  ) {
    await utilisateur.click(
      screen.getByRole("button", { name: `Actions de la ligne ${String(rang)}` }),
    );
    await utilisateur.click(
      screen.getByRole("menuitem", { name: `Supprimer la ligne ${String(rang)}` }),
    );
    return screen.findByRole("alertdialog", { name: `Supprimer la ligne ${String(rang)} ?` });
  }

  it("F-018-AC25 la confirmation est une alerte qui dit l'irréversible, focus sur Annuler ; Annuler ne modifie rien", async () => {
    const { utilisateur, emises } = rendreLaTable(troisLignes);
    const alerte = await demander(utilisateur, 2);
    expect(alerte.textContent).toMatch(/ne peut pas être annulée/);
    expect(focus()).toBe(within(alerte).getByRole("button", { name: "Annuler" }));
    await utilisateur.keyboard("{Enter}");
    expect(emises).toEqual([]);
    expect(focus()).toBe(cellule(3, 1));
  });

  it("F-018-AC25 confirmée, la ligne est supprimée par une seule opération ; la cellule courante passe à la même colonne de la suivante, ou de la précédente", async () => {
    const { table, utilisateur, emises } = rendreLaTable(troisLignes);
    await utilisateur.click(
      within(await demander(utilisateur, 2)).getByRole("button", { name: "Supprimer la ligne" }),
    );
    expect(emises).toHaveLength(1);
    expect(premiers()).toEqual(["Une", "Trois"]);
    expect(focus()).toBe(cellule(3, 1));

    await utilisateur.click(
      within(await demander(utilisateur, 2)).getByRole("button", { name: "Supprimer la ligne" }),
    );
    expect(table.lire().lignes).toHaveLength(1);
    expect(focus()).toBe(cellule(2, 1));
  });
});
