// Raison de la lecture seule d'une table (F-018-AC52) : la zone principale passe à l'écran de table
// la raison que l'application lui donne, sans la reconstruire d'un booléen.
import { creerDocumentTable, type DocumentTable } from "@notionlike/document";
import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { lire } from "./aides-disque.ts";
import { rendreUneTable } from "./aides-session-page.tsx";
import { TABLE_D_ESSAI } from "./vues-de-table/aides-grille.tsx";

const ouvertes: DocumentTable[] = [];
afterEach(() => {
  cleanup();
  ouvertes.splice(0).forEach((table) => table.fermer());
});

function rendreLaZone(proprietes: {
  readonly lectureSeule?: boolean;
  readonly raisonDeLectureSeule?: string;
}): void {
  const table = creerDocumentTable();
  ouvertes.push(table);
  table.creerColonne("Nom", "texte");
  rendreUneTable(table, TABLE_D_ESSAI, proprietes);
}

function descriptionDe(element: HTMLElement): string {
  const id = element.getAttribute("aria-describedby") ?? "";
  return id === "" ? "" : (document.getElementById(id)?.textContent ?? "");
}

describe("raison de la lecture seule d'une table (F-018-AC52)", () => {
  it("F-018-AC52 l'écran de table porte la raison donnée à la zone principale, telle quelle", () => {
    rendreLaZone({ lectureSeule: true, raisonDeLectureSeule: "Raison d'essai" });
    const bouton = screen.getByRole<HTMLButtonElement>("button", { name: "Nouvelle ligne" });
    expect(bouton.disabled).toBe(true);
    expect(descriptionDe(bouton)).toBe("Raison d'essai");
  });

  it("F-018-AC52 sans raison, la table est modifiable", () => {
    rendreLaZone({});
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Nouvelle ligne" }).disabled).toBe(
      false,
    );
  });

  it("F-018-AC52 l'application donne à la zone principale la lecture seule et sa raison d'une même valeur ; la zone n'importe pas les messages de synchronisation", () => {
    const application = lire("src/interface/Application.tsx");
    expect(application).toContain("lectureSeule={props.lectureSeule !== undefined}");
    expect(application).toContain("raisonDeLectureSeule={props.lectureSeule}");
    expect(lire("src/interface/ZonePrincipale.tsx")).not.toContain("messages-synchronisation");
  });
});
