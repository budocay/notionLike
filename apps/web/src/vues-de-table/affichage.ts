// Affichage d'une cellule par des règles fixes (F-018-AC26, H7) : ni langue ni fuseau de l'appareil,
// ni `Intl`, ni conversion locale. La date est découpée comme une chaîne, jamais lue comme un objet
// date.
import type { ColonneLue, ValeurDeCellule } from "@notionlike/document";

import { libelleAffiche } from "./textes.ts";

/** Forme décimale la plus courte, virgule pour séparateur, sans séparateur de milliers. */
export function nombreAffiche(nombre: number): string {
  return String(nombre).replace(".", ",");
}

const FORME_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** `AAAA-MM-JJ` devient `JJ/MM/AAAA` ; une autre forme est rendue telle quelle. */
export function dateAffichee(date: string): string {
  const morceaux = FORME_DATE.exec(date);
  if (morceaux === null) {
    return date;
  }
  const [, annee = "", mois = "", jour = ""] = morceaux;
  return `${jour}/${mois}/${annee}`;
}

/**
 * Le texte d'une cellule de type texte, nombre, date ou sélection ; vide pour une cellule vide.
 * Une case n'a pas de texte : elle s'affiche cochée ou non (`estCochee`).
 */
export function texteAffiche(colonne: ColonneLue, valeur: ValeurDeCellule | null): string {
  if (valeur === null) {
    return "";
  }
  switch (colonne.type) {
    case "texte":
      return String(valeur);
    case "nombre":
      return typeof valeur === "number" ? nombreAffiche(valeur) : "";
    case "date":
      return typeof valeur === "string" ? dateAffichee(valeur) : "";
    case "selection": {
      const option = colonne.options.find((une) => une.id === valeur);
      return option === undefined ? "" : libelleAffiche(option.libelle);
    }
    case "case":
      return "";
  }
}

/** Une case non cochée pour `false` comme pour une cellule vide (AC26). */
export function estCochee(valeur: ValeurDeCellule | null): boolean {
  return valeur === true;
}

/** Le texte proposé dans le champ quand la cellule passe en mode édition. */
export function texteDEdition(colonne: ColonneLue, valeur: ValeurDeCellule | null): string {
  if (valeur === null) {
    return "";
  }
  if (colonne.type === "nombre" && typeof valeur === "number") {
    return nombreAffiche(valeur);
  }
  return typeof valeur === "string" ? valeur : "";
}
