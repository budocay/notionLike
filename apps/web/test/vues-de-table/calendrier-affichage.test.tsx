// Lignes affichées de la vue calendrier (F-021-AC25) : la définition de F-019 (filtres et tris) vaut
// pour la vue, dans les cases comme dans le panneau « Sans date », et l'affichage figé de F-019-AC17
// s'applique à un changement de date.
import type { DocumentTable } from "@notionlike/document";
import { describe, expect, it } from "vitest";

import {
  CLE_DES_REGLAGES,
  caseDuJour,
  entree,
  figerLHorloge,
  libellesDe,
  lignesDuPanneau,
} from "./aides-calendrier.tsx";
import { focus, rendreLaTable } from "./aides-grille.tsx";

figerLHorloge();

interface Colonnes {
  readonly nom: string;
  readonly echeance: string;
}

/** Remplit la table de l'essai et enregistre, pour l'appareil, la vue et la définition voulues. */
function preparer(
  lignes: readonly [string, string | null][],
  definition: (colonnes: Colonnes) => { filtres: object[]; tris: object[] },
): (table: DocumentTable) => void {
  return (table) => {
    const nom = table.creerColonne("Nom", "texte");
    const echeance = table.creerColonne("Échéance", "date");
    for (const [titre, date] of lignes) {
      table.creerLigne(
        new Map([
          [nom, titre],
          [echeance, date],
        ]),
      );
    }
    localStorage.setItem(
      CLE_DES_REGLAGES,
      JSON.stringify({
        version: 1,
        sections: { vue: { active: "calendrier" }, "filtres-tris": definition({ nom, echeance }) },
      }),
    );
  };
}

describe("lignes affichées dans le calendrier (F-021-AC25)", () => {
  it("F-021-AC25 un filtre écarte les lignes des cases et du panneau, un tri ordonne chaque case", () => {
    rendreLaTable(
      preparer(
        [
          ["ok-C", "2026-10-08"],
          ["écartée", "2026-10-08"],
          ["ok-A", "2026-10-08"],
          ["ok-B", "2026-10-08"],
          ["ok-sans", null],
          ["écartée sans date", null],
        ],
        ({ nom }) => ({
          filtres: [{ colonne: nom, operateur: "contient", valeur: "ok" }],
          tris: [{ colonne: nom, sens: "croissant" }],
        }),
      ),
    );
    expect(libellesDe("2026-10-08")).toEqual(["ok-A", "ok-B", "ok-C"]);
    expect(lignesDuPanneau().map((ligne) => ligne.getAttribute("aria-label"))).toEqual(["ok-sans"]);
  });

  it("F-021-AC25 le sens décroissant du tri s'applique à l'intérieur d'une case", () => {
    rendreLaTable(
      preparer(
        [
          ["A", "2026-10-08"],
          ["B", "2026-10-08"],
        ],
        ({ nom }) => ({ filtres: [], tris: [{ colonne: nom, sens: "decroissant" }] }),
      ),
    );
    expect(libellesDe("2026-10-08")).toEqual(["B", "A"]);
  });

  it("F-021-AC25 une ligne déplacée au jour suivant reste présentée à son nouveau jour, même hors filtre, et l'ordre trié est gardé", async () => {
    const { utilisateur } = rendreLaTable(
      preparer(
        [
          ["B", "2026-10-08"],
          ["A", "2026-10-08"],
        ],
        ({ nom, echeance }) => ({
          filtres: [{ colonne: echeance, operateur: "avant", valeur: "2026-10-09" }],
          tris: [{ colonne: nom, sens: "croissant" }],
        }),
      ),
    );
    expect(libellesDe("2026-10-08")).toEqual(["A", "B"]);
    entree("A").focus();
    await utilisateur.keyboard("{Alt>}{Shift>}{ArrowRight}{/Shift}{/Alt}");
    expect(libellesDe("2026-10-08")).toEqual(["B"]);
    expect(libellesDe("2026-10-09")).toEqual(["A"]);
    expect(caseDuJour("2026-10-09").contains(entree("A"))).toBe(true);
    expect(focus()).toBe(entree("A"));
    // La ligne ne satisfait plus le filtre (le 9 n'est pas avant le 9) : sans gel, elle aurait disparu.
    await utilisateur.keyboard("{Alt>}{Shift>}{ArrowLeft}{/Shift}{/Alt}");
    expect(libellesDe("2026-10-08")).toEqual(["A", "B"]);
  });
});
