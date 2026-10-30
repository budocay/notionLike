// F-018-AC45 : toute vue de la liste passe par `lignesAffichees` pour lire les lignes de la table.
// La fonction est remplacée ici par une qui n'en garde qu'une sur deux et les renverse : chaque vue
// rendue ne montre que ce qu'elle rend. Chaque vue de la liste est rendue pour de bon : elle est
// enregistrée comme vue active dans les réglages avant le rendu, et constatée affichée avant que ses
// lignes ne soient lues.
import { screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { nomDeLaPile, nomDeLaVue } from "../../src/vues-de-table/kanban/textes.ts";
import { nomDeLaGrille, SELECTEUR_DE_VUES } from "../../src/vues-de-table/textes.ts";
import { avecSelecteur, VUES } from "../../src/vues-de-table/vues.ts";
import { ESPACE_A } from "../aides-persistance.ts";
import { cleDesReglages } from "../aides-table.ts";
import { grille, rendreLaTable, TABLE_D_ESSAI, textesDesLignes } from "./aides-grille.tsx";

vi.mock("../../src/vues-de-table/lignes-affichees.ts", async (originales) => {
  const module = await originales<typeof import("../../src/vues-de-table/lignes-affichees.ts")>();
  return {
    ...module,
    lignesAffichees: (table: Parameters<typeof module.lignesAffichees>[0]) =>
      module
        .lignesAffichees(table)
        .filter((_, rang) => rang % 2 === 0)
        .reverse(),
  };
});

interface LecteurDeVue {
  /** Vrai si c'est bien cette vue qui est rendue, et non la vue de repli. */
  readonly estAffichee: () => boolean;
  /** Le texte de la colonne « Nom » de chaque ligne que la vue montre, dans son ordre. */
  readonly noms: () => string[];
}

// Une vue ajoutée à la liste (F-020, F-021) sans lecteur ici fait échouer le test : son auteur dit
// comment la reconnaître et lire ses lignes, et le test prouve alors qu'elle passe par la fonction.
const LECTEURS: Readonly<Record<string, LecteurDeVue>> = {
  tableau: {
    estAffichee: () => screen.queryByRole("grid", { name: nomDeLaGrille("Budget") }) !== null,
    noms: () => {
      const noms = textesDesLignes().map(([nom]) => nom ?? "");
      expect(grille().getAttribute("aria-rowcount")).toBe(String(noms.length + 1));
      return noms;
    },
  },
  calendrier: {
    estAffichee: () =>
      screen.queryByRole("grid", { name: /^Calendrier de la table Budget, / }) !== null,
    // Les lignes de l'essai n'ont pas de date : elles sont toutes dans le panneau « Sans date ».
    noms: () =>
      [...document.querySelectorAll("li[data-sans-date] > span:first-child")].map(
        (libelle) => libelle.textContent ?? "",
      ),
  },
  // Les cartes de la pile « Sans valeur » : la table d'essai a une colonne Sélection, sans option.
  kanban: {
    estAffichee: () =>
      screen.queryByRole("group", { name: nomDeLaVue("Budget", "Statut") }) !== null,
    noms: () =>
      within(screen.getByRole("group", { name: nomDeLaPile(null, 3) }))
        .getAllByRole("listitem")
        .map((carte) => carte.textContent?.replace(/Actions de la carte.*$/, "") ?? ""),
  },
};

const CLE = cleDesReglages({ idEspace: ESPACE_A, idTable: TABLE_D_ESSAI });
afterEach(() => localStorage.clear());

describe("lignes affichées (F-018-AC45)", () => {
  it.each(VUES.map(({ id, libelle }) => [id, libelle]))(
    "F-018-AC45 la vue « %s » (%s), rendue active, ne lit les lignes que par lignesAffichees",
    (id, libelle) => {
      const lecteur = LECTEURS[id];
      expect(lecteur, `aucun lecteur pour la vue « ${id} »`).toBeDefined();
      localStorage.setItem(CLE, JSON.stringify({ version: 1, sections: { vue: { active: id } } }));

      rendreLaTable((table) => {
        const nom = table.creerColonne("Nom", "texte");
        table.creerColonne("Échéance", "date");
        table.creerColonne("Statut", "selection");
        for (const texte of ["A", "B", "C", "D", "E"]) {
          table.creerLigne(new Map([[nom, texte]]));
        }
      });

      if (avecSelecteur()) {
        const selecteur = screen.getByRole("group", { name: SELECTEUR_DE_VUES });
        expect(
          within(selecteur).getByRole("button", { name: libelle }).getAttribute("aria-pressed"),
        ).toBe("true");
      }
      expect(lecteur?.estAffichee()).toBe(true);
      expect(lecteur?.noms()).toEqual(["E", "C", "A"]);
    },
  );
});
