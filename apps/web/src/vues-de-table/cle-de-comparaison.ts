// Clé de comparaison d'un texte (F-019-AC4, AC8, H4) : calculée par le projet, sans la langue ni le
// fuseau de l'appareil. Décomposition canonique (NFD), retrait des seuls signes combinants du bloc
// U+0300 à U+036F, puis minuscules par la règle indépendante de la langue (`toLowerCase`).
// `\p{M}` et `\p{Diacritic}` sont écartés exprès (veille du 2026-10-27) : le premier fusionne des
// mots des écritures indiennes (`क्षि` devient `कष`), le second vide la clé de `^` et de `¨`, de sorte
// que « contient » `^` serait vrai pour tout texte.
const SIGNES_COMBINANTS = /[\u0300-\u036f]/g;

export function cleDeComparaison(texte: string): string {
  return texte.normalize("NFD").replace(SIGNES_COMBINANTS, "").toLowerCase();
}

/** Ordre des unités UTF-16, que l'opérateur `<` applique à deux chaînes. */
export function comparerLesUnites(a: string, b: string): number {
  if (a < b) {
    return -1;
  }
  return a > b ? 1 : 0;
}

/** Ordre de deux textes : leurs clés, puis, à clés égales, les textes eux-mêmes (AC8). */
export function comparerLesTextes(a: string, b: string): number {
  return comparerLesUnites(cleDeComparaison(a), cleDeComparaison(b)) || comparerLesUnites(a, b);
}
