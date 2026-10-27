// Regroupement en piles et colonne de regroupement (F-020-AC2, AC3, AC4) : fonctions sans DOM, sur une
// table de cas.
import { afterEach, describe, expect, it } from "vitest";

import { colonneDeRegroupement, regrouper } from "../../src/vues-de-table/kanban/piles.ts";
import { regroupementLu, sectionDuKanban } from "../../src/vues-de-table/kanban/reglages-kanban.ts";
import { lignesAffichees } from "../../src/vues-de-table/lignes-affichees.ts";
import { contexteDe, tableDeKanban, titresParPile } from "./aides-kanban.ts";

const ouvertes: { fermer(): void }[] = [];
afterEach(() => ouvertes.splice(0).forEach((table) => table.fermer()));
function essai(...arguments_: Parameters<typeof tableDeKanban>) {
  const une = tableDeKanban(...arguments_);
  ouvertes.push(une.table);
  return une;
}

describe("regroupement (F-020-AC3)", () => {
  it("F-020-AC3 F-020-AC2 table de cas : cellule vide, option sans carte, ordre des lignes, toutes dans une pile", () => {
    const { table } = essai([
      ["a", 1],
      ["b", -1],
      ["c", 1],
      ["d", 0],
      ["e", 1],
    ]);
    const { lue, regroupement } = contexteDe(table);
    const piles = regrouper(lue, lignesAffichees(lue), regroupement);

    expect(piles.map(({ option, libelle }) => [option === null ? null : libelle])).toEqual([
      [null],
      ["À faire"],
      ["En cours"],
      ["Fait"],
    ]);
    expect(titresParPile(table)).toEqual([["b"], ["d"], ["a", "c", "e"], []]);
    // Une ligne, une carte, une seule fois.
    expect(piles.flatMap(({ cartes }) => cartes).length).toBe(lue.lignes.length);
  });

  it("F-020-AC3 aucune option : une seule pile, « Sans valeur » ; toutes les lignes dans une pile", () => {
    const { table } = essai(
      [
        ["a", -1],
        ["b", -1],
      ],
      [],
    );
    expect(titresParPile(table)).toEqual([["a", "b"]]);
    const tout = essai([
      ["a", 2],
      ["b", 2],
    ]);
    expect(titresParPile(tout.table)).toEqual([[], [], [], ["a", "b"]]);
  });

  it("F-020-AC3 F-020-AC2 une option retirée renvoie ses cartes dans « Sans valeur » ; une cellule qui désigne une option inconnue aussi", () => {
    const { table, statut, options } = essai([
      ["a", 0],
      ["b", 1],
    ]);
    table.retirerOption(statut, options[1] ?? "");
    expect(titresParPile(table)).toEqual([["b"], ["a"], []]);
    // Même sur une table lue qui garderait la valeur : l'option n'existe pas, la carte est « Sans valeur ».
    const { lue, regroupement } = contexteDe(table);
    const forgee = {
      ...lue,
      lignes: lue.lignes.map((ligne) => ({
        ...ligne,
        cellules: [ligne.cellules[0] ?? null, "inconnue"],
      })),
    };
    expect(
      regrouper(forgee, forgee.lignes, regroupement).map(({ cartes }) => cartes.length),
    ).toEqual([2, 0, 0]);
  });

  it("F-020-AC2 l'ordre des cartes d'une pile est celui des lignes affichées, pas celui de la table", () => {
    const { table } = essai([
      ["a", 0],
      ["b", 0],
      ["c", 0],
    ]);
    const { lue, regroupement } = contexteDe(table);
    const inversees = [...lignesAffichees(lue)].reverse();
    expect(
      regrouper(lue, inversees, regroupement).map(({ cartes }) => cartes.map(({ titre }) => titre)),
    ).toEqual([[], ["c", "b", "a"], [], []]);
    // Une ligne non affichée n'a pas de carte.
    expect(
      regrouper(lue, inversees.slice(0, 1), regroupement).flatMap(({ cartes }) => cartes).length,
    ).toBe(1);
  });
});

describe("colonne de regroupement (F-020-AC4)", () => {
  it("F-020-AC4 la première colonne de sélection par défaut ; la colonne choisie si elle l'est encore ; sinon la première ; aucune sans colonne de sélection", () => {
    const { table, statut } = essai([["a", 0]]);
    const seconde = table.creerColonne("Priorité", "selection");
    table.creerColonne("Note", "nombre");
    const lue = table.lire();

    expect(colonneDeRegroupement(lue, undefined)?.id).toBe(statut);
    expect(colonneDeRegroupement(lue, seconde)?.id).toBe(seconde);
    expect(colonneDeRegroupement(lue, "disparue")?.id).toBe(statut);
    // Une colonne choisie qui n'est plus une colonne de sélection : retour à la première.
    expect(colonneDeRegroupement(lue, lue.colonnes[0]?.id)?.id).toBe(statut);
    table.supprimerColonne(statut);
    table.supprimerColonne(seconde);
    expect(colonneDeRegroupement(table.lire(), seconde)).toBeUndefined();
  });

  it("F-020-AC4 la section kanban : lue si bien formée, écrite sans perdre les autres clés, le choix explicite enregistré même quand il désigne la colonne par défaut", () => {
    expect(regroupementLu({ regroupement: "c1" })).toBe("c1");
    expect(regroupementLu({ regroupement: 3 })).toBeUndefined();
    expect(regroupementLu("x")).toBeUndefined();
    expect(regroupementLu(undefined)).toBeUndefined();

    expect(sectionDuKanban("c2", undefined)).toEqual({ regroupement: "c2" });
    expect(sectionDuKanban("c2", { regroupement: "c3", futur: true })).toEqual({
      futur: true,
      regroupement: "c2",
    });
    // Le choix de la colonne que l'ordre des colonnes désigne aujourd'hui est gardé tel quel.
    expect(sectionDuKanban("c1", { regroupement: "c2" })).toEqual({ regroupement: "c1" });
    expect(sectionDuKanban("c1", { regroupement: "c2", futur: 1 })).toEqual({
      futur: 1,
      regroupement: "c1",
    });
  });
});
