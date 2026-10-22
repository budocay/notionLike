// Analyse des saisies de cellule (F-018-AC27, AC28, AC30), sans DOM : le texte saisi devient la
// valeur à écrire, `null` pour vider la cellule, ou un refus. La conformité d'une date au calendrier
// est jugée par le document (F-017-AC18) ; ici, seule sa forme.
import type { ValeurDeCellule } from "@notionlike/document";

import { LONGUEUR_MAX_TEXTE } from "./textes.ts";

export type Analyse =
  | { readonly sorte: "valeur"; readonly valeur: ValeurDeCellule | null }
  | { readonly sorte: "refus"; readonly refus: "texte-trop-long" | "nombre-invalide" };

const VIDE: Analyse = { sorte: "valeur", valeur: null };

/** Le texte tel que saisi, sans rognage ; vidé, il vide la cellule (AC27). */
export function analyserTexte(saisi: string): Analyse {
  if (saisi.length > LONGUEUR_MAX_TEXTE) {
    return { sorte: "refus", refus: "texte-trop-long" };
  }
  return saisi === "" ? VIDE : { sorte: "valeur", valeur: saisi };
}

// Un signe facultatif, au moins un chiffre, une partie décimale facultative introduite par une
// virgule ou un point (AC28) : ni exposant, ni espace, ni séparateur de milliers, ni « ,5 » ni « 5, ».
const FORME_D_UN_NOMBRE = /^-?[0-9]+(?:[.,][0-9]+)?$/;

/** Espaces de début et de fin retirés ; vide, la cellule est vidée ; refus sinon (AC28). */
export function analyserNombre(saisi: string): Analyse {
  const rogne = saisi.trim();
  if (rogne === "") {
    return VIDE;
  }
  if (!FORME_D_UN_NOMBRE.test(rogne)) {
    return { sorte: "refus", refus: "nombre-invalide" };
  }
  const nombre = Number(rogne.replace(",", "."));
  return Number.isFinite(nombre)
    ? { sorte: "valeur", valeur: nombre }
    : { sorte: "refus", refus: "nombre-invalide" };
}

/**
 * La valeur du champ de date telle quelle, `AAAA-MM-JJ` (AC30) : jamais un objet date. Vide, la
 * cellule est vidée ; la conformité au calendrier est jugée par le document.
 */
export function analyserDate(saisi: string): Analyse {
  return saisi === "" ? VIDE : { sorte: "valeur", valeur: saisi };
}

/** Vrai si la valeur validée est celle que la cellule porte déjà : rien n'est écrit (AC32). */
export function memeValeur(a: ValeurDeCellule | null, b: ValeurDeCellule | null): boolean {
  return Object.is(a, b) || (typeof a === "number" && typeof b === "number" && a === b);
}
