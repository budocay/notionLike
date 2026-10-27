// Placement des lignes sur la grille du mois (F-021-AC5, AC6, AC8, AC28), sans DOM ni bibliothèque :
// la colonne de date, puis les lignes affichées réparties entre les cases et le panneau « Sans date ».
// La comparaison porte sur les chaînes `AAAA-MM-JJ`, jamais sur un objet date.
import type { ColonneLue, IdColonne, LigneLue } from "@notionlike/document";

import { estUnJour } from "./jours.ts";

/** La colonne de date et son rang dans la table lue. */
export interface ColonneDeDate {
  readonly colonne: ColonneLue;
  readonly rang: number;
}

/**
 * La colonne choisie si c'est encore une colonne `date` de la table lue, sinon la première colonne
 * `date` dans l'ordre des colonnes (AC6) ; `undefined` si la table n'en a aucune (AC7).
 */
export function colonneDeDate(
  colonnes: readonly ColonneLue[],
  choisie: IdColonne | undefined,
): ColonneDeDate | undefined {
  const dates = colonnes.flatMap((colonne, rang) =>
    colonne.type === "date" ? [{ colonne, rang }] : [],
  );
  return dates.find(({ colonne }) => colonne.id === choisie) ?? dates[0];
}

/** Les colonnes `date` de la table lue, dans l'ordre des colonnes. */
export function colonnesDeDate(colonnes: readonly ColonneLue[]): readonly ColonneLue[] {
  return colonnes.filter(({ type }) => type === "date");
}

/** Le jour que porte la cellule de date de la ligne, s'il est dans les bornes ; sinon `undefined`. */
export function jourDeLaLigne(ligne: LigneLue, rangDeLaColonne: number): string | undefined {
  const valeur = ligne.cellules[rangDeLaColonne];
  return estUnJour(valeur) ? valeur : undefined;
}

export interface Repartition {
  /** Les lignes de chaque jour de la grille, dans l'ordre des lignes affichées. */
  readonly parJour: ReadonlyMap<string, readonly LigneLue[]>;
  /** Les lignes sans jour dans les bornes (cellule vide ou non conforme), dans le même ordre. */
  readonly sansDate: readonly LigneLue[];
}

/**
 * Répartit les lignes affichées : dans la case de leur jour, et dans cette case seulement, quand ce
 * jour est dans la grille ; dans le panneau « Sans date » quand leur cellule ne porte aucun jour
 * des bornes ; nulle part ailleurs (un jour d'un autre mois n'est ni dans une case ni sans date).
 */
export function repartir(
  lignes: readonly LigneLue[],
  rangDeLaColonne: number,
  grille: readonly string[],
): Repartition {
  const parJour = new Map<string, LigneLue[]>(grille.map((jour) => [jour, []]));
  const sansDate: LigneLue[] = [];
  for (const ligne of lignes) {
    const jour = jourDeLaLigne(ligne, rangDeLaColonne);
    if (jour === undefined) {
      sansDate.push(ligne);
    } else {
      parJour.get(jour)?.push(ligne);
    }
  }
  return { parJour, sansDate };
}
