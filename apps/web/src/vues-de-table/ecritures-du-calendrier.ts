// Écritures de la vue calendrier dans le document de table (F-021-AC10, AC11, AC12, AC24) : chacune
// par une seule opération de la façade, son refus typé dit en français. Un déplacement n'écrit que la
// cellule de date de la ligne, et rien si la ligne porte déjà le jour visé. Les jours visés, les pas et
// leurs bornes se décident hors d'ici (`dates-visees.ts`, `pas-du-calendrier.ts`) ; ici, seulement
// l'écriture dans le document.
import type { DocumentTable, IdLigne, LigneLue } from "@notionlike/document";

import { ecrire, type Surveillance } from "./ecritures.ts";
import type { Refus } from "./dates-visees.ts";
import type { ColonneDeDate } from "./repartition.ts";
import { ecrireLaValeur } from "./valider.ts";

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
