// Aides des tests de la vue calendrier (F-021) : horloge figée au jeudi 8 octobre 2026, vue
// « Calendrier » choisie dans les réglages de l'appareil, table de l'essai et accès aux cases, aux
// entrées et au panneau par leurs rôles et leurs attributs.
import { type DocumentTable, ouvrirDocumentTable } from "@notionlike/document";
import { cleanup, render, screen, within } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, vi } from "vitest";
import * as Y from "yjs";

import { EcranDeTable } from "../../src/vues-de-table/index.ts";

import { ESPACE_A } from "../aides-persistance.ts";
import { cleDesReglages } from "../aides-table.ts";
import { rendreLaTable, type TableRendue, TABLE_D_ESSAI } from "./aides-grille.tsx";

export const AUJOURD_HUI_DE_L_ESSAI = "2026-10-08";
export const CLE_DES_REGLAGES = cleDesReglages({ idEspace: ESPACE_A, idTable: TABLE_D_ESSAI });

/** Fige `Date` (seulement) au 8 octobre 2026, midi, heure locale ; à appeler dans le fichier de test. */
export function figerLHorloge(instant: Date = new Date(2026, 9, 8, 12)): void {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(instant);
  });
  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });
}

export function choisirLeCalendrier(sections: Record<string, unknown> = {}): void {
  localStorage.setItem(
    CLE_DES_REGLAGES,
    JSON.stringify({ version: 1, sections: { vue: { active: "calendrier" }, ...sections } }),
  );
}

export interface LigneDEssai {
  readonly titre: string;
  readonly date: string | null;
}

/** Colonnes « Nom » (texte) et « Échéance » (date), puis une ligne par titre, dans l'ordre. */
export function tableDEssai(lignes: readonly LigneDEssai[]): (table: DocumentTable) => void {
  return (table) => {
    const nom = table.creerColonne("Nom", "texte");
    const echeance = table.creerColonne("Échéance", "date");
    for (const { titre, date } of lignes) {
      table.creerLigne(
        new Map([
          [nom, titre],
          [echeance, date],
        ]),
      );
    }
  };
}

export function rendreLeCalendrier(
  lignes: readonly LigneDEssai[] = [],
  options: { readonly lectureSeule?: string } = {},
): TableRendue {
  choisirLeCalendrier();
  return rendreLaTable(tableDEssai(lignes), options);
}

export function grilleDuCalendrier(): HTMLElement {
  return screen.getByRole("grid", { name: /^Calendrier de la table / });
}

export function caseDuJour(jour: string): HTMLElement {
  const trouvee = grilleDuCalendrier().querySelector<HTMLElement>(
    `[role="gridcell"][data-jour="${jour}"]`,
  );
  if (trouvee === null) {
    throw new Error(`Aucune case pour ${jour}.`);
  }
  return trouvee;
}

export function cases(): HTMLElement[] {
  return [...grilleDuCalendrier().querySelectorAll<HTMLElement>('[role="gridcell"]')];
}

export function entreesDe(jour: string): HTMLElement[] {
  return [...caseDuJour(jour).querySelectorAll<HTMLElement>("[data-ligne]")];
}

export function libellesDe(jour: string): string[] {
  return entreesDe(jour).map((entree) => entree.getAttribute("aria-label") ?? "");
}

export function entree(libelle: string): HTMLElement {
  return within(grilleDuCalendrier()).getByRole("group", { name: libelle });
}

export function panneau(): HTMLElement {
  return screen.getByRole("region", { name: /^Sans date/ });
}

export function lignesDuPanneau(): HTMLElement[] {
  return [...panneau().querySelectorAll<HTMLElement>("li[data-sans-date]")];
}

export function annonces(): string {
  return document.querySelector('[role="status"]')?.textContent ?? "";
}

/** Rend le calendrier d'un document dont l'état encodé est donné : une réplique de plus. */
export function rendreLeCalendrierDepuis(etat: Uint8Array): DocumentTable {
  choisirLeCalendrier();
  const doc = new Y.Doc();
  Y.applyUpdate(doc, etat);
  const table = ouvrirDocumentTable(doc);
  render(
    <StrictMode>
      <EcranDeTable
        etat={{
          phase: "pret",
          table,
          enregistre: true,
          baseRelue: true,
          reessayer: () => undefined,
        }}
        idEspace={ESPACE_A}
        idTable={TABLE_D_ESSAI}
        titre="Budget"
        lectureSeule={undefined}
      />
    </StrictMode>,
  );
  return table;
}

export function demonterLeCalendrier(): void {
  cleanup();
}
