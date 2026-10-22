// La cellule courante de la grille (F-018-AC33, AC35), désignée par les identifiants de sa ligne et
// de sa colonne, avec sa dernière place connue : une mise à jour reçue ne la déplace pas, et si sa
// ligne ou sa colonne disparaît, elle passe à la cellule voisine la plus proche. Sans DOM.
import type { ColonneLue, IdColonne, IdLigne, LigneLue } from "@notionlike/document";

import type { Position } from "./navigation-grille.ts";

export interface Courante {
  /** `null` : la rangée d'en-têtes. */
  readonly ligne: IdLigne | null;
  /** `null` : la colonne des actions de ligne. */
  readonly colonne: IdColonne | null;
  /** Dernière place connue, pour la voisine la plus proche. */
  readonly place: Position;
}

/** L'angle de la grille : la rangée d'en-têtes et la colonne des actions de ligne, place `(0,0)`. */
export const COURANTE_INITIALE: Courante = {
  ligne: null,
  colonne: null,
  place: { rang: 0, colonne: 0 },
};

function borner(valeur: number, max: number): number {
  return Math.min(max, Math.max(0, valeur));
}

/** La place de la cellule courante dans les lignes affichées et les colonnes lues. */
export function placeDe(
  courante: Courante,
  lignes: readonly LigneLue[],
  colonnes: readonly ColonneLue[],
): Position {
  const indiceLigne =
    courante.ligne === null ? -1 : lignes.findIndex(({ id }) => id === courante.ligne);
  const indiceColonne =
    courante.colonne === null ? -1 : colonnes.findIndex(({ id }) => id === courante.colonne);
  return {
    rang:
      courante.ligne === null
        ? 0
        : indiceLigne >= 0
          ? indiceLigne + 1
          : borner(courante.place.rang, lignes.length),
    colonne:
      courante.colonne === null
        ? 0
        : indiceColonne >= 0
          ? indiceColonne + 1
          : borner(courante.place.colonne, colonnes.length),
  };
}

/** La cellule courante à cette place. */
export function couranteA(
  place: Position,
  lignes: readonly LigneLue[],
  colonnes: readonly ColonneLue[],
): Courante {
  return {
    ligne: place.rang === 0 ? null : (lignes[place.rang - 1]?.id ?? null),
    colonne: place.colonne === 0 ? null : (colonnes[place.colonne - 1]?.id ?? null),
    place,
  };
}

/** Vrai si les deux désignent la même cellule. */
export function memeCellule(a: Courante, b: Courante): boolean {
  return a.ligne === b.ligne && a.colonne === b.colonne;
}

/** Clé d'une cellule de la grille, pour retrouver son élément. */
export function cleDeCellule(ligne: IdLigne | null, colonne: IdColonne | null): string {
  return `${ligne ?? ""}\u0000${colonne ?? ""}`;
}
