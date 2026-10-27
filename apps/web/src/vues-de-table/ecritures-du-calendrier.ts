// Écritures de la vue calendrier dans le document de table (F-021-AC10, AC11, AC12, AC24) : chacune
// par une seule opération de la façade, son refus typé dit en français. Un déplacement n'écrit que la
// cellule de date de la ligne, et rien si la ligne porte déjà le jour visé. Les raccourcis et leurs
// bornes se décident ici, sans DOM.
import type { DocumentTable, IdLigne, LigneLue } from "@notionlike/document";

import { ecrire } from "./ecritures.ts";
import { decaler } from "./jours.ts";
import { type ColonneDeDate, jourDeLaLigne } from "./repartition.ts";
import { ecrireLaValeur } from "./valider.ts";

/** Nombre de jours d'un déplacement : -1 et 1 (un jour), -7 et 7 (une semaine). */
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
 * Écrit la cellule de date de la ligne : le jour donné, ou `null` pour la retirer. Rien n'est écrit
 * si la cellule porte déjà cette valeur (AC11).
 */
export function ecrireLaDate(
  table: DocumentTable,
  ligne: LigneLue,
  colonne: ColonneDeDate,
  jour: string | null,
): Refus {
  const avant = ligne.cellules[colonne.rang] ?? null;
  return ecrireLaValeur(table, { ligne: ligne.id, colonne: colonne.colonne, avant }, jour);
}

/** Vrai si la cellule de date de la ligne porte déjà ce jour (`null` : déjà sans date). */
export function dateDejaEcrite(
  ligne: LigneLue,
  colonne: ColonneDeDate,
  jour: string | null,
): boolean {
  return (ligne.cellules[colonne.rang] ?? null) === jour;
}

/** Crée, en dernière position, une ligne dont la cellule de date porte le jour (AC10). */
export function creerUneLigneDuJour(
  table: DocumentTable,
  colonne: ColonneDeDate,
  jour: string,
): { readonly ligne: IdLigne } | { readonly refus: string } {
  const issue = ecrire(() => table.creerLigne(new Map([[colonne.colonne.id, jour]])));
  return issue.reussie ? { ligne: issue.valeur } : { refus: issue.message };
}

export function supprimerLaLigne(table: DocumentTable, ligne: IdLigne): Refus {
  const issue = ecrire(() => table.supprimerLigne(ligne));
  return issue.reussie ? undefined : issue.message;
}
