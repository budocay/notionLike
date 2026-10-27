// Changement de vue et affichage figé (F-019-AC18, AC15) : la liste des vues est remplacée par deux
// vues, comme dans `selecteur.test.tsx`. La définition vaut pour toutes les vues, et passer d'une vue
// à l'autre rend l'affichage au calcul.
import { screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { annonce, barre, filtrer, noms, remplirSixLignes } from "./aides-barres.tsx";
import { cellule, rendreLaTable } from "./aides-grille.tsx";

vi.mock("../../src/vues-de-table/vues.ts", async (originales) => {
  const module = await originales<typeof import("../../src/vues-de-table/vues.ts")>();
  const vues = [...module.VUES, { id: "seconde", libelle: "Seconde" }];
  return {
    ...module,
    VUES: vues,
    IDS_DES_VUES: vues.map(({ id }) => id),
    avecSelecteur: () => module.avecSelecteur(vues),
  };
});

afterEach(() => localStorage.clear());

describe("changement de vue (F-019-AC15, AC18)", () => {
  it("F-019-AC18 changer de vue rend l'affichage recalculé : plus de « Hors filtre », plus de « Réappliquer »", async () => {
    const { utilisateur } = rendreLaTable(remplirSixLignes);
    await filtrer(utilisateur, { depart: "Nom", cible: "Prix" }, "=", "7");
    cellule(2, 3).focus();
    await utilisateur.keyboard("8{Enter}");
    expect(noms()).toEqual(["École", "ecole"]);
    expect(
      screen.getByRole("button", { name: "Réappliquer les filtres et les tris" }),
    ).toBeTruthy();
    await annonce(
      "Les lignes affichées ne sont plus recalculées. Activez « Réappliquer les filtres et les tris » pour les recalculer.",
    );

    const selecteur = screen.getByRole("group", { name: "Vue de la table" });
    await utilisateur.click(within(selecteur).getByRole("button", { name: "Seconde" }));

    expect(noms()).toEqual(["ecole"]);
    expect(
      screen.queryByRole("button", { name: "Réappliquer les filtres et les tris" }),
    ).toBeNull();
  });

  it("F-019-AC15 la même définition s'applique après un changement de vue", async () => {
    const { utilisateur } = rendreLaTable(remplirSixLignes);
    await filtrer(utilisateur, { depart: "Nom", cible: "État" }, "est", "En cours");
    const selecteur = screen.getByRole("group", { name: "Vue de la table" });

    await utilisateur.click(within(selecteur).getByRole("button", { name: "Seconde" }));
    expect(noms()).toEqual(["Zèbre", "École", "Banane"]);
    expect(barre("Filtres").textContent).toContain("1 filtre · 3 lignes sur 6");
    await utilisateur.click(within(selecteur).getByRole("button", { name: "Tableau" }));
    expect(noms()).toEqual(["Zèbre", "École", "Banane"]);
  });
});
