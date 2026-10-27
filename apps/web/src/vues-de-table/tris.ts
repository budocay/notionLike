// Tris d'une définition (F-019-AC7 à AC10) : l'état d'un tri dans la table lue, et l'ordre de deux
// lignes. Ordre total et identique sur tout appareil : les égalités passent au tri suivant, puis à
// l'ordre manuel de la table lue. Sans langue ni fuseau de l'appareil (AC11).
import type { ColonneLue, LigneLue, TableLue, ValeurDeCellule } from "@notionlike/document";

import { cleDeComparaison, comparerLesUnites } from "./cle-de-comparaison.ts";
import type { Tri } from "./definition.ts";
import { estSansValeur } from "./filtres.ts";

/** Ce par quoi une cellule se range, ou `null` pour une cellule sans valeur (AC9). */
type Cle = number | string | { readonly cle: string; readonly brut: string } | null;

function cleDeTri(colonne: ColonneLue, cellule: ValeurDeCellule | null): Cle {
  if (cellule === null || estSansValeur(colonne, cellule)) {
    return null;
  }
  switch (colonne.type) {
    case "texte":
      return { cle: cleDeComparaison(String(cellule)), brut: String(cellule) };
    case "nombre":
      return Number(cellule);
    case "case":
      return cellule === true ? 1 : 0;
    case "date":
      return String(cellule);
    case "selection":
      return colonne.options.findIndex(({ id }) => id === cellule);
  }
}

function comparerLesCles(a: NonNullable<Cle>, b: NonNullable<Cle>): number {
  if (typeof a === "number" && typeof b === "number") {
    return a < b ? -1 : a > b ? 1 : 0;
  }
  if (typeof a === "string" && typeof b === "string") {
    return comparerLesUnites(a, b);
  }
  if (typeof a === "object" && typeof b === "object") {
    return comparerLesUnites(a.cle, b.cle) || comparerLesUnites(a.brut, b.brut);
  }
  return 0;
}

export interface TriCompile {
  readonly rang: number;
  readonly colonne: ColonneLue;
  readonly decroissant: boolean;
}

/** Le tri est actif quand sa colonne est dans la table lue (AC23). */
export function colonneDuTri(table: Pick<TableLue, "colonnes">, tri: Tri): ColonneLue | undefined {
  return table.colonnes.find(({ id }) => id === tri.colonne);
}

export function compilerLesTris(
  table: Pick<TableLue, "colonnes">,
  tris: readonly Tri[],
): TriCompile[] {
  const compiles: TriCompile[] = [];
  for (const tri of tris) {
    const rang = table.colonnes.findIndex(({ id }) => id === tri.colonne);
    const colonne = table.colonnes[rang];
    if (colonne !== undefined) {
      compiles.push({ rang, colonne, decroissant: tri.sens === "decroissant" });
    }
  }
  return compiles;
}

export interface LigneARanger {
  readonly ligne: LigneLue;
  /** Place dans l'ordre manuel de la table lue : départage les égalités (AC10). */
  readonly ordre: number;
  readonly cles: readonly Cle[];
}

/** Les clés de chaque tri pour une ligne, calculées une fois pour toutes. */
export function ranger(ligne: LigneLue, ordre: number, tris: readonly TriCompile[]): LigneARanger {
  return {
    ligne,
    ordre,
    cles: tris.map(({ rang, colonne }) => cleDeTri(colonne, ligne.cellules[rang] ?? null)),
  };
}

/** Les cellules sans valeur après toutes les autres, dans les deux sens (AC9). */
export function comparerLesLignes(
  tris: readonly TriCompile[],
): (a: LigneARanger, b: LigneARanger) => number {
  return (a, b) => {
    for (const [rang, { decroissant }] of tris.entries()) {
      const cleA = a.cles[rang] ?? null;
      const cleB = b.cles[rang] ?? null;
      if (cleA === null || cleB === null) {
        if (cleA !== cleB) {
          return cleA === null ? 1 : -1;
        }
        continue;
      }
      const ordre = comparerLesCles(cleA, cleB);
      if (ordre !== 0) {
        return decroissant ? -ordre : ordre;
      }
    }
    return a.ordre - b.ordre;
  };
}
