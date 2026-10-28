// Les dates que visent les commandes du calendrier (F-021-AC11, AC12), sans React ni Yjs : le jour
// qu'un pas de jours désigne, le refus d'une date saisie, la date déjà écrite. Les écritures dans le
// document sont à `ecritures-du-calendrier.ts` ; les pas et leurs touches, à `pas-du-calendrier.ts`.
import type { LigneLue } from "@notionlike/document";

import { decaler, estUnJour } from "./jours.ts";
import { type ColonneDeDate, jourDeLaLigne } from "./repartition.ts";
import { DATE_INVALIDE } from "./textes.ts";

/** Nombre de jours d'un déplacement : ±1 (un jour), ±7 (une semaine, `JOURS_PAR_SEMAINE`). */
export type PasDeJours = number;

/** `undefined` : écrit (ou rien à écrire) ; sinon le message du refus. */
export type Refus = string | undefined;

/** Le jour visé par un pas à partir du jour de la ligne ; `undefined` hors des bornes ou sans jour. */
export function jourVise(
  ligne: LigneLue,
  colonne: ColonneDeDate,
  pas: PasDeJours,
): string | undefined {
  const jour = jourDeLaLigne(ligne, colonne.rang);
  return jour === undefined ? undefined : decaler(jour, pas);
}

/**
 * Le refus d'une date saisie dans la boîte « Définir la date » : vide ou hors des bornes
 * (`0000-12-31`, `10000-01-01`), le message de F-018-AC30 sans rien écrire ; sinon le refus du
 * document, rendu par `fixer`, quand il y en a un.
 */
export function refusDeLaDate(texte: string, fixer: (jour: string) => Refus): Refus {
  return estUnJour(texte) ? fixer(texte) : DATE_INVALIDE;
}

/** Vrai si la cellule de date de la ligne porte déjà ce jour (`null` : déjà sans date). */
export function dateDejaEcrite(
  ligne: LigneLue,
  colonne: ColonneDeDate,
  jour: string | null,
): boolean {
  return (ligne.cellules[colonne.rang] ?? null) === jour;
}
