// Le calcul des lignes affichées n'est refait que si la table lue ou la définition change, pas au
// défilement ni à la navigation (F-019-AC28).
import { fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import * as calcul from "../../src/vues-de-table/lignes-affichees.ts";
import { ajouterUnTri, filtrer, remplirSixLignes } from "./aides-barres.tsx";
import { cellule, rendreLaTable } from "./aides-grille.tsx";

vi.mock("../../src/vues-de-table/lignes-affichees.ts", async (originale) => {
  const module = await originale<typeof import("../../src/vues-de-table/lignes-affichees.ts")>();
  return { ...module, lignesAffichees: vi.fn(module.lignesAffichees) };
});

afterEach(() => localStorage.clear());

describe("recalcul des lignes affichées (F-019-AC28)", () => {
  it("F-019-AC28 le défilement et la navigation au clavier d'une grande table ne rappellent pas le calcul ; un changement de définition ou de table le rappelle", async () => {
    const { table, utilisateur } = rendreLaTable((une) => {
      remplirSixLignes(une);
      const nom = une.lire().colonnes[0]?.id ?? "";
      for (let rang = 0; rang < 300; rang += 1) {
        une.creerLigne(new Map([[nom, `Ligne ${String(rang)}`]]));
      }
    });
    await filtrer(utilisateur, { depart: "Nom", cible: "Nom" }, "contient", "ligne");
    await ajouterUnTri(utilisateur);
    const espion = vi.mocked(calcul.lignesAffichees);
    const avant = espion.mock.calls.length;
    expect(avant).toBeGreaterThan(0);

    const grille = screen.getByRole("grid");
    for (const decalage of [200, 1500, 4000, 0]) {
      fireEvent.scroll(grille, { target: { scrollTop: decalage } });
      fireEvent.scroll(grille.parentElement as HTMLElement, { target: { scrollTop: decalage } });
    }
    cellule(2, 2).focus();
    await utilisateur.keyboard("{PageDown}{PageDown}{Control>}{End}{/Control}{PageUp}{ArrowDown}");
    expect(espion.mock.calls.length).toBe(avant);

    await ajouterUnTri(utilisateur);
    expect(espion.mock.calls.length).toBeGreaterThan(avant);
    const apresDefinition = espion.mock.calls.length;
    table.ecrireCellule(table.lire().lignes[0]?.id ?? "", table.lire().colonnes[0]?.id ?? "", "x");
    expect(espion.mock.calls.length).toBeGreaterThanOrEqual(apresDefinition);
  });
});
