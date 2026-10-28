// Écritures de la vue calendrier dans le document de table (F-021-AC10, AC11, AC12, AC24) : chacune
// par une seule opération de la façade, son refus typé dit en français. Un déplacement n'écrit que la
// cellule de date de la ligne, et rien si la ligne porte déjà le jour visé. Les raccourcis et leurs
// bornes se décident ici, sans DOM.
import type { DocumentTable, IdLigne, LigneLue } from "@notionlike/document";

import { ecrire, type Surveillance } from "./ecritures.ts";
import { decaler, estUnJour } from "./jours.ts";
import { type ColonneDeDate, jourDeLaLigne } from "./repartition.ts";
import { DATE_INVALIDE } from "./textes.ts";
import { ecrireLaValeur } from "./valider.ts";

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
 * Écrit la cellule de date de la ligne : le jour donné, ou `null` pour la retirer. Rien n'est écrit
 * si la cellule porte déjà cette valeur (AC11).
 */
export function ecrireLaDate(
  table: DocumentTable,
  ligne: LigneLue,
  colonne: ColonneDeDate,
  jour: string | null,
  surveillance: Surveillance,
): Refus {
  const avant = ligne.cellules[colonne.rang] ?? null;
  return ecrireLaValeur(
    table,
    { ligne: ligne.id, colonne: colonne.colonne, avant },
    jour,
    surveillance,
  );
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

/** Crée, en dernière position, une ligne dont la cellule de date porte le jour (AC10). */
export function creerUneLigneDuJour(
  table: DocumentTable,
  colonne: ColonneDeDate,
  jour: string,
  surveillance: Surveillance,
): { readonly ligne: IdLigne } | { readonly refus: string } {
  const valeurs = new Map([[colonne.colonne.id, jour]]);
  const issue = ecrire(() => table.creerLigne(valeurs), surveillance);
  if (!issue.reussie) {
    return { refus: issue.message };
  }
  surveillance.creee(issue.valeur);
  return { ligne: issue.valeur };
}

export function supprimerLaLigne(table: DocumentTable, ligne: IdLigne): Refus {
  const issue = ecrire(() => table.supprimerLigne(ligne));
  return issue.reussie ? undefined : issue.message;
}
