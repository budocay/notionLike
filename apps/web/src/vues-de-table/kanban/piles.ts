// Regroupement des lignes affichées en piles (F-020-AC1 à AC4) : une fonction sans DOM ni
// bibliothèque, depuis la table lue, les lignes affichées et la colonne de regroupement. Une pile par
// option de la colonne, dans l'ordre des options, précédées de la pile « Sans valeur » (H4).
import type {
  ColonneLue,
  IdColonne,
  IdLigne,
  IdOption,
  LigneLue,
  TableLue,
} from "@notionlike/document";

import { colonneDeTitre } from "../lignes-affichees.ts";

/** Une ligne affichée, présentée comme une carte ; `titre` est le texte brut, vide s'il n'y en a pas. */
export interface Carte {
  readonly id: IdLigne;
  readonly titre: string;
}

/** `option` est `null` pour la pile « Sans valeur » ; `libelle` est le libellé brut de l'option. */
export interface Pile {
  readonly option: IdOption | null;
  readonly libelle: string;
  readonly cartes: readonly Carte[];
}

/** Les colonnes `selection` de la table lue, dans l'ordre des colonnes. */
export function colonnesDeSelection(lue: TableLue): readonly ColonneLue[] {
  return lue.colonnes.filter((colonne) => colonne.type === "selection");
}

/**
 * La colonne de regroupement : la colonne choisie si elle est encore une colonne `selection`, sinon
 * la première (AC4) ; `undefined` si la table n'en a aucune (AC5).
 */
export function colonneDeRegroupement(
  lue: TableLue,
  choisie: IdColonne | undefined,
): ColonneLue | undefined {
  const colonnes = colonnesDeSelection(lue);
  return colonnes.find(({ id }) => id === choisie) ?? colonnes[0];
}

/** L'option que porte la ligne pour la colonne ; `null` si sa cellule est vide ou désigne une option retirée. */
export function optionDeLaLigne(
  ligne: LigneLue,
  rangDeColonne: number,
  colonne: ColonneLue,
): IdOption | null {
  const valeur = ligne.cellules[rangDeColonne];
  return typeof valeur === "string" && colonne.options.some(({ id }) => id === valeur)
    ? valeur
    : null;
}

function titreDe(ligne: LigneLue, rangDuTitre: number): string {
  const valeur = rangDuTitre < 0 ? null : ligne.cellules[rangDuTitre];
  return typeof valeur === "string" ? valeur : "";
}

/** Les piles et leurs cartes, dans l'ordre des lignes affichées (AC2). */
export function regrouper(
  lue: TableLue,
  lignes: readonly LigneLue[],
  regroupement: ColonneLue,
): readonly Pile[] {
  const rangDuRegroupement = lue.colonnes.findIndex(({ id }) => id === regroupement.id);
  const titre = colonneDeTitre(lue);
  const rangDuTitre = lue.colonnes.findIndex(({ id }) => id === titre?.id);
  const cartes = new Map<IdOption | null, Carte[]>([
    [null, []],
    ...regroupement.options.map((option): [IdOption, Carte[]] => [option.id, []]),
  ]);
  for (const ligne of lignes) {
    const option = optionDeLaLigne(ligne, rangDuRegroupement, regroupement);
    cartes.get(option)?.push({ id: ligne.id, titre: titreDe(ligne, rangDuTitre) });
  }
  return [
    { option: null, libelle: "", cartes: cartes.get(null) ?? [] },
    ...regroupement.options.map(({ id, libelle }) => ({
      option: id,
      libelle,
      cartes: cartes.get(id) ?? [],
    })),
  ];
}
