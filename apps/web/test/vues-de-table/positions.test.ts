// Position d'une ligne déplacée sous des filtres (F-019-AC19) : table de cas, puis preuve par le
// document que la ligne se place juste avant la précédente affichée ou juste après la suivante.
import { creerDocumentTable } from "@notionlike/document";
import { describe, expect, it } from "vitest";

import { positionDeDeplacement } from "../../src/vues-de-table/positions.ts";

function lignes(...ids: string[]) {
  return ids.map((id) => ({ id, cellules: [] }));
}

describe("position de déplacement (F-019-AC19)", () => {
  const manuel = lignes("a", "b", "c", "d", "e");

  it.each([
    [
      "monter une ligne dont la précédente affichée est séparée par une ligne masquée",
      ["a", "c", "e"],
      "c",
      -1,
      0,
    ],
    ["descendre, une ligne masquée entre les deux", ["a", "c", "e"], "c", 1, 4],
    ["monter, sans ligne masquée", ["a", "b", "c", "d", "e"], "c", -1, 1],
    ["descendre, sans ligne masquée", ["a", "b", "c", "d", "e"], "c", 1, 3],
    ["la première ligne affichée ne monte pas", ["b", "d"], "b", -1, undefined],
    ["la dernière ligne affichée ne descend pas", ["b", "d"], "d", 1, undefined],
    ["une ligne qui n'est pas affichée", ["b", "d"], "c", 1, undefined],
    ["une voisine absente de l'ordre manuel", ["b", "z"], "b", 1, undefined],
  ] as const)("F-019-AC19 %s", (_, affichees, ligne, sens, attendue) => {
    expect(positionDeDeplacement(manuel, lignes(...affichees), ligne, sens)).toBe(attendue);
  });

  it("F-019-AC19 déplacée à la position rendue, la ligne passe avant la précédente affichée ou après la suivante", () => {
    const ordre = (deplacement: -1 | 1): string[] => {
      const table = creerDocumentTable();
      table.creerColonne("Nom", "texte");
      const ids = ["a", "b", "c", "d", "e"].map(() => table.creerLigne());
      const [a, , c, , e] = ids;
      const nom = (id: string | undefined): string =>
        id === a ? "a" : id === c ? "c" : id === e ? "e" : "-";
      const lues = table.lire().lignes;
      const position = positionDeDeplacement(
        lues,
        lues.filter(({ id }) => id === a || id === c || id === e),
        c ?? "",
        deplacement,
      );
      table.deplacerLigne(c ?? "", position ?? -1);
      const resultat = table.lire().lignes.map(({ id }) => nom(id));
      table.fermer();
      return resultat;
    };
    expect(ordre(-1)).toEqual(["c", "a", "-", "-", "e"]);
    expect(ordre(1)).toEqual(["a", "-", "-", "e", "c"]);
  });
});
