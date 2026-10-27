// Aides des tests de F-019 : une table lue construite à la main (le calcul des lignes affichées est
// sans document), et la liste témoin du tri de texte, tenue en un seul endroit (AC11).
import type { ColonneLue, LigneLue, TableLue, ValeurDeCellule } from "@notionlike/document";

import type { Definition, Filtre, Tri } from "../../src/vues-de-table/definition.ts";

export function colonne(
  id: string,
  type: ColonneLue["type"],
  options: readonly string[] = [],
): ColonneLue {
  return { id, nom: id, type, options: options.map((une) => ({ id: une, libelle: une })) };
}

export function table(
  colonnes: readonly ColonneLue[],
  lignes: readonly (readonly (ValeurDeCellule | null)[])[],
): TableLue {
  return {
    colonnes,
    lignes: lignes.map((cellules, rang): LigneLue => ({ id: `l${String(rang)}`, cellules })),
  };
}

export function definition(filtres: readonly Filtre[] = [], tris: readonly Tri[] = []): Definition {
  return { filtres, tris };
}

/** Les identifiants des lignes rendues, dans l'ordre. */
export function ids(lignes: readonly LigneLue[]): string[] {
  return lignes.map(({ id }) => id);
}

/**
 * La liste témoin d'AC11, dans un ordre de saisie quelconque. `null` : cellule vide. Les cas `^` et
 * `क्षि` figent le choix de la veille du 2026-10-27 (plage U+0300 à U+036F, ni `\p{M}` ni
 * `\p{Diacritic}`).
 */
export const LISTE_TEMOIN: readonly (string | null)[] = [
  "Zèbre",
  "abricot",
  "Âne",
  "école",
  "Ecole",
  "eclair",
  "10",
  "9",
  "",
  null,
  "œuf",
  "Œil",
  "İstanbul",
  "ß",
  "^",
  "क्षि",
];

/** L'ordre croissant attendu, calculé à la main ; les cellules sans valeur suivent, dans l'ordre manuel. */
export const ORDRE_CROISSANT_TEMOIN: readonly (string | null)[] = [
  "10",
  "9",
  "^",
  "abricot",
  "Âne",
  "eclair",
  "Ecole",
  "école",
  "İstanbul",
  "Zèbre",
  "ß",
  "Œil",
  "œuf",
  "क्षि",
  "",
  null,
];
