// Aides des tests de l'écran de table (F-018) : un document de table tenu par le test, rendu par
// l'écran de table comme la zone principale le fait, et l'accès à la grille par ses rôles.
import {
  creerDocumentTable,
  type DocumentTable,
  ouvrirDocumentTable,
  type TableLue,
} from "@notionlike/document";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { StrictMode } from "react";
import { afterEach } from "vitest";
import * as Y from "yjs";

import type { EtatSessionTable } from "../../src/table/session-table.ts";
import { EcranDeTable } from "../../src/vues-de-table/index.ts";
import { ESPACE_A } from "../aides-persistance.ts";

export const TABLE_D_ESSAI = "cccccccc-1111-4222-8333-444444444444";

const ouvertes: DocumentTable[] = [];
afterEach(() => {
  cleanup();
  ouvertes.splice(0).forEach((table) => table.fermer());
});

export interface TableRendue {
  readonly table: DocumentTable;
  readonly utilisateur: UserEvent;
  /** Mises à jour émises par le document depuis le rendu. */
  readonly emises: Uint8Array[];
  readonly rerendre: (lectureSeule?: string) => void;
}

function pret(table: DocumentTable): EtatSessionTable {
  return { phase: "pret", table, enregistre: true, baseRelue: true, reessayer: () => undefined };
}

/** Rend l'écran d'une table, remplie d'abord par `remplir`, sous `StrictMode`. */
export function rendreLaTable(
  remplir: (table: DocumentTable) => void = () => undefined,
  options: { readonly lectureSeule?: string; readonly idTable?: string } = {},
): TableRendue {
  const table = creerDocumentTable();
  ouvertes.push(table);
  remplir(table);
  const emises: Uint8Array[] = [];
  table.doc.on("update", (miseAJour: Uint8Array) => emises.push(miseAJour));
  const idTable = options.idTable ?? TABLE_D_ESSAI;
  const ecran = (lectureSeule?: string) => (
    <StrictMode>
      <EcranDeTable
        etat={pret(table)}
        idEspace={ESPACE_A}
        idTable={idTable}
        titre="Budget"
        lectureSeule={lectureSeule}
      />
    </StrictMode>
  );
  const { rerender } = render(ecran(options.lectureSeule));
  return {
    table,
    utilisateur: userEvent.setup(),
    emises,
    rerendre: (lectureSeule) => rerender(ecran(lectureSeule)),
  };
}

export function grille(): HTMLElement {
  return screen.getByRole("grid");
}

/** Les rangées présentes, en-têtes compris. */
export function rangees(): HTMLElement[] {
  return within(grille()).getAllByRole("row");
}

/** La cellule de la rangée d'indice ARIA donné (1 : les en-têtes) et de la colonne d'indice ARIA donné. */
export function cellule(indiceDeRangee: number, indiceDeColonne: number): HTMLElement {
  const rangee = rangees().find(
    (une) => une.getAttribute("aria-rowindex") === String(indiceDeRangee),
  );
  const trouvee = rangee?.querySelector<HTMLElement>(
    `[aria-colindex="${String(indiceDeColonne)}"]`,
  );
  if (trouvee === undefined || trouvee === null) {
    throw new Error(`Aucune cellule ${String(indiceDeRangee)}, ${String(indiceDeColonne)}.`);
  }
  return trouvee;
}

/** Le texte de chaque cellule de donnée, rangée par rangée. */
export function textesDesLignes(): string[][] {
  return rangees()
    .slice(1)
    .map((rangee) =>
      [...rangee.querySelectorAll<HTMLElement>('[role="gridcell"]')].map((une) => {
        const caseACocher = une.querySelector<HTMLInputElement>('input[type="checkbox"]');
        return caseACocher === null ? (une.textContent ?? "") : caseACocher.checked ? "☑" : "☐";
      }),
    );
}

export function nomsDesEnTetes(): string[] {
  return within(grille())
    .getAllByRole("columnheader")
    .slice(1)
    .map((enTete) => enTete.textContent ?? "");
}

/** L'élément qui a le focus. */
export function focus(): Element | null {
  return document.activeElement;
}

/** La table lue. */
export function lue(table: DocumentTable): TableLue {
  return table.lire();
}

/** Applique à la table une mise à jour d'une autre réplique, comme la synchronisation la livrera. */
export function recevoirDansLaTable(
  table: DocumentTable,
  modifier: (replique: DocumentTable) => void,
): void {
  const replique = new Y.Doc();
  Y.applyUpdate(replique, Y.encodeStateAsUpdate(table.doc));
  const avant = Y.encodeStateVector(replique);
  const facade = ouvrirDocumentTable(replique);
  modifier(facade);
  facade.fermer();
  act(() => Y.applyUpdate(table.doc, Y.encodeStateAsUpdate(replique, avant)));
}
