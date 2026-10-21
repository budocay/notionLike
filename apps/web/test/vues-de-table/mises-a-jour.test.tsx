// Mises à jour reçues, refus et limites (F-018-AC35 à AC37) : la grille suit la table lue, la
// cellule courante reste sur sa ligne et sa colonne, une cellule en mode édition disparue ou changée
// est traitée sans rien perdre, un refus typé est dit en français.
import { type CodeErreurDocument, type DocumentTable, ErreurDocument } from "@notionlike/document";
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { messageErreur } from "../../src/interface/messages.ts";
import {
  cellule,
  focus,
  recevoirDansLaTable,
  rendreLaTable,
  textesDesLignes,
} from "./aides-grille.tsx";

function deuxLignes(table: DocumentTable): void {
  const nom = table.creerColonne("Nom", "texte");
  table.creerColonne("Note", "texte");
  table.creerLigne(new Map([[nom, "A"]]));
  table.creerLigne(new Map([[nom, "B"]]));
}

const CODES = Object.keys({
  "page-introuvable": true,
  "page-a-la-corbeille": true,
  "deplacement-cyclique": true,
  "titre-trop-long": true,
  "position-invalide": true,
  "version-non-prise-en-charge": true,
  "facade-fermee": true,
  "version-invalide": true,
  "rang-indisponible": true,
  "page-hors-corbeille": true,
  "pas-un-document-de-table": true,
  "type-de-colonne-inconnu": true,
  "nom-non-admis": true,
  "libelle-non-admis": true,
  "ligne-introuvable": true,
  "colonne-introuvable": true,
  "colonne-sans-options": true,
  "option-introuvable": true,
  "valeur-non-conforme": true,
} satisfies Record<CodeErreurDocument, true>) as CodeErreurDocument[];

describe("mises à jour reçues (F-018-AC35)", () => {
  it("F-018-AC35 une ligne insérée devant et une colonne déplacée par une autre réplique : la grille se met à jour et la cellule courante reste sur la même ligne et la même colonne", () => {
    const { table } = rendreLaTable(deuxLignes);
    cellule(3, 3).focus();
    recevoirDansLaTable(table, (replique) => {
      replique.creerLigne(undefined, 0);
      const note = replique.lire().colonnes[1]?.id ?? "";
      replique.deplacerColonne(note, 0);
    });

    expect(textesDesLignes()).toEqual([
      ["", ""],
      ["", "A"],
      ["", "B"],
    ]);
    expect(focus()).toBe(cellule(4, 2));
  });

  it("F-018-AC35 la ligne de la cellule courante disparue : la cellule voisine la plus proche devient courante ; sans colonne, l'invitation", () => {
    const { table } = rendreLaTable(deuxLignes);
    cellule(3, 2).focus();
    recevoirDansLaTable(table, (replique) =>
      replique.supprimerLigne(replique.lire().lignes[1]?.id ?? ""),
    );
    expect(focus()).toBe(cellule(2, 2));

    recevoirDansLaTable(table, (replique) => {
      for (const { id } of replique.lire().colonnes) {
        replique.supprimerColonne(id);
      }
    });
    expect(screen.getByText(/aucune colonne/)).toBeDefined();
    expect(focus()).toBe(screen.getByRole("button", { name: "Ajouter une colonne" }));
  });

  it("F-018-AC35 la dernière colonne retirée par une mise à jour reçue alors que le focus est hors de la grille : le focus n'est pas déplacé", () => {
    const { table } = rendreLaTable(deuxLignes);
    const dehors = document.createElement("button");
    document.body.append(dehors);
    dehors.focus();
    recevoirDansLaTable(table, (replique) => {
      for (const { id } of replique.lire().colonnes) {
        replique.supprimerColonne(id);
      }
    });
    expect(screen.getByText(/aucune colonne/)).toBeDefined();
    expect(focus()).toBe(dehors);
    dehors.remove();
  });
});

describe("cellule en mode édition (F-018-AC36)", () => {
  it("F-018-AC36 sa ligne supprimée par une mise à jour reçue : le mode édition est quitté sans rien écrire, et l'écran le dit", async () => {
    const { table, utilisateur } = rendreLaTable(deuxLignes);
    cellule(2, 2).focus();
    await utilisateur.keyboard("en cours");
    recevoirDansLaTable(table, (replique) =>
      replique.supprimerLigne(replique.lire().lignes[0]?.id ?? ""),
    );

    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByRole("alert").textContent).toBe(
      "La cellule que vous modifiiez a été supprimée.",
    );
    expect(table.lire().lignes.map(({ cellules }) => cellules[0])).toEqual(["B"]);
  });

  it("F-018-AC36 sa valeur changée par une mise à jour reçue : le texte en cours de saisie est gardé, la validation l'écrit", async () => {
    const { table, utilisateur } = rendreLaTable(deuxLignes);
    cellule(2, 2).focus();
    await utilisateur.keyboard("{F2}-local");
    recevoirDansLaTable(table, (replique) => {
      const [ligne] = replique.lire().lignes;
      replique.ecrireCellule(ligne?.id ?? "", replique.lire().colonnes[0]?.id ?? "", "distant");
    });
    expect(screen.getByRole<HTMLInputElement>("textbox").value).toBe("A-local");
    await utilisateur.keyboard("{Enter}");
    expect(table.lire().lignes[0]?.cellules[0]).toBe("A-local");
  });
});

describe("refus du document (F-018-AC37)", () => {
  it("F-018-AC37 le traducteur donne un message français sans code pour chaque code que @notionlike/document publie", () => {
    expect(CODES).toHaveLength(19);
    for (const code of CODES) {
      const message = messageErreur(code);
      expect(message, code).toMatch(/^[A-ZÀ-Ý].*\.$/);
      expect(message, code).not.toContain(code);
    }
  });

  it("F-018-AC37 une opération refusée par une erreur typée : un message en français sans code, la grille conforme à la table lue, toujours utilisable", async () => {
    const { table, utilisateur, emises } = rendreLaTable(deuxLignes);
    const refus = vi.spyOn(table, "creerLigne").mockImplementation(() => {
      throw new ErreurDocument("rang-indisponible", "refus du document");
    });
    await utilisateur.click(screen.getByRole("button", { name: "Nouvelle ligne" }));

    expect(screen.getByRole("alert").textContent).toBe(messageErreur("rang-indisponible"));
    expect(screen.getByRole("alert").textContent).not.toMatch(
      /rang-indisponible|refus du document/,
    );
    expect(textesDesLignes()).toEqual([
      ["A", ""],
      ["B", ""],
    ]);
    refus.mockRestore();
    cellule(2, 3).focus();
    await utilisateur.keyboard("ok{Enter}");
    expect(table.lire().lignes[0]?.cellules[1]).toBe("ok");
    expect(emises).toHaveLength(1);
  });
});
