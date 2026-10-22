// Surfaces flottantes de la grille (F-018-AC20, AC24, AC31) : menu et liste de choix sont posés sur
// la cellule qui les ouvre, à sa place au moment de l'ouverture. La grille défilée (au pointeur), ils
// se fermeraient loin d'elle : ils se ferment, sans rien écrire, et le focus revient à la cellule. Un
// événement de défilement sans déplacement (défilement déjà appliqué à l'ouverture) ne ferme rien.
import type { DocumentTable } from "@notionlike/document";
import { act, fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { cellule, focus, grille, rendreLaTable } from "./aides-grille.tsx";

function avecSelection(table: DocumentTable): void {
  table.creerColonne("Nom", "texte");
  const etat = table.creerColonne("État", "selection");
  table.ajouterOption(etat, "En cours");
  table.creerLigne();
}

function zone(): HTMLElement {
  return grille().firstElementChild as HTMLElement;
}

/** Pose la position de défilement de la zone, puis lui envoie l'événement `scroll`. */
function defiler(haut: number, gauche: number): void {
  const element = zone();
  Object.defineProperty(element, "scrollTop", { configurable: true, value: haut });
  Object.defineProperty(element, "scrollLeft", { configurable: true, value: gauche });
  act(() => void fireEvent.scroll(element));
}

describe("surfaces flottantes et défilement de la grille (F-018-AC20, AC31)", () => {
  it("F-018-AC20 F-018-AC24 le menu d'un en-tête se ferme quand la grille défile, et le focus revient à l'en-tête ; sans déplacement, il reste ouvert", async () => {
    const { utilisateur } = rendreLaTable(avecSelection);
    cellule(1, 2).focus();
    await utilisateur.keyboard("{Enter}");
    expect(await screen.findByRole("menu", { name: "Actions de la colonne Nom" })).toBeDefined();

    defiler(0, 0);
    expect(screen.queryByRole("menu")).not.toBeNull();

    defiler(0, 40);
    expect(screen.queryByRole("menu")).toBeNull();
    expect(focus()).toBe(cellule(1, 2));
  });

  it("F-018-AC31 la liste de choix d'une cellule se ferme sans rien écrire quand la grille défile, et le focus revient à la cellule", async () => {
    const { utilisateur, emises } = rendreLaTable(avecSelection);
    cellule(2, 3).focus();
    await utilisateur.keyboard("{Enter}");
    expect(screen.getByRole("listbox", { name: "Choix pour la colonne État" })).toBeDefined();

    defiler(48, 0);
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(focus()).toBe(cellule(2, 3));
    expect(emises).toEqual([]);
  });
});
