// F-018-AC45 : toute vue de la liste passe par `lignesAffichees` pour lire les lignes de la table.
// La fonction est remplacée ici par une qui n'en garde qu'une sur deux et les renverse : chaque vue
// rendue ne montre que ce qu'elle rend.
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { VUES } from "../../src/vues-de-table/vues.ts";
import { rendreLaTable, textesDesLignes } from "./aides-grille.tsx";

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

describe("lignes affichées (F-018-AC45)", () => {
  it.each(VUES.map(({ id }) => id))(
    "F-018-AC45 la vue « %s » ne lit les lignes que par lignesAffichees",
    () => {
      rendreLaTable((table) => {
        const nom = table.creerColonne("Nom", "texte");
        for (const texte of ["A", "B", "C", "D", "E"]) {
          table.creerLigne(new Map([[nom, texte]]));
        }
      });
      expect(textesDesLignes()).toEqual([["E"], ["C"], ["A"]]);
      expect(screen.getByRole("grid").getAttribute("aria-rowcount")).toBe("4");
    },
  );
});
