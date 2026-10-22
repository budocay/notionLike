// F-018-AC44, AC42 : le sélecteur de vues paraît dès que la liste des vues en compte deux. La liste,
// tenue en un seul endroit, est remplacée ici par deux vues : la vue choisie est conservée dans la
// section `vue` des réglages, sans rien écrire dans le document de table.
import { screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

import { ESPACE_A } from "../aides-persistance.ts";
import { cleDesReglages } from "../aides-table.ts";
import { rendreLaTable, TABLE_D_ESSAI } from "./aides-grille.tsx";

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

const CLE = cleDesReglages({ idEspace: ESPACE_A, idTable: TABLE_D_ESSAI });
afterEach(() => localStorage.clear());

describe("sélecteur de vues (F-018-AC44)", () => {
  it("F-018-AC44 F-018-AC42 deux vues : le sélecteur paraît, la vue active marquée ; le choix est conservé dans la section vue, sans mise à jour Yjs", async () => {
    const { table, utilisateur, emises } = rendreLaTable((une) => une.creerColonne("Nom", "texte"));
    const avant = Y.encodeStateAsUpdate(table.doc);
    const selecteur = screen.getByRole("group", { name: "Vue de la table" });
    expect(
      within(selecteur).getByRole("button", { name: "Tableau" }).getAttribute("aria-pressed"),
    ).toBe("true");

    await utilisateur.click(within(selecteur).getByRole("button", { name: "Seconde" }));

    expect(JSON.parse(localStorage.getItem(CLE) ?? "null")).toEqual({
      version: 1,
      sections: { vue: { active: "seconde" } },
    });
    expect(
      within(selecteur).getByRole("button", { name: "Seconde" }).getAttribute("aria-pressed"),
    ).toBe("true");
    await utilisateur.click(within(selecteur).getByRole("button", { name: "Tableau" }));
    expect(localStorage.getItem(CLE)).toBeNull();
    expect(emises).toEqual([]);
    expect(Y.encodeStateAsUpdate(table.doc)).toEqual(avant);
  });
});
