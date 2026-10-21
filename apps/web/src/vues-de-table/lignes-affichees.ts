// Ce que les vues partagent (F-018-AC45) : les lignes affichées et la colonne de titre, calculées
// sans DOM ni bibliothèque depuis la table lue. Toute vue reçoit les lignes par la première, jamais
// `table.lignes` ; F-019 y ajoutera filtres et tris sans toucher aux vues.
import type { ColonneLue, LigneLue, TableLue } from "@notionlike/document";

/** Toutes les lignes de la table lue, dans l'ordre manuel (F-018 vocabulaire). */
export function lignesAffichees(table: TableLue): readonly LigneLue[] {
  return table.lignes;
}

/** La première colonne de type `texte` dans l'ordre des colonnes, s'il y en a une. */
export function colonneDeTitre(table: TableLue): ColonneLue | undefined {
  return table.colonnes.find((colonne) => colonne.type === "texte");
}
