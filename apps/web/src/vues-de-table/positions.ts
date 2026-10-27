// Position d'une ligne déplacée parmi les lignes affichées (F-019-AC19, H7), sans DOM : sous des
// filtres seuls, « monter » place la ligne juste avant la ligne affichée qui la précède, « descendre »
// juste après celle qui la suit, dans l'ordre manuel de la table, que des lignes masquées peuvent
// séparer. La façade attend la place finale de la ligne : celle qu'occupe aujourd'hui la voisine.
import type { IdLigne, LigneLue } from "@notionlike/document";

/**
 * La position à donner à `deplacerLigne` pour que `ligne` passe d'une place parmi les lignes
 * `affichees` ; `undefined` si la ligne est la première ou la dernière affichée, ou inconnue.
 */
export function positionDeDeplacement(
  manuel: readonly LigneLue[],
  affichees: readonly LigneLue[],
  ligne: IdLigne,
  sens: -1 | 1,
): number | undefined {
  const rang = affichees.findIndex(({ id }) => id === ligne);
  const voisine = affichees[rang + sens];
  if (rang < 0 || voisine === undefined) {
    return undefined;
  }
  const position = manuel.findIndex(({ id }) => id === voisine.id);
  return position < 0 ? undefined : position;
}
