// Rang d'une page parmi ses sœurs (ADR-0002, « Rangs ») : la partie fractionnaire d'un nombre
// entre 0 et 1 exclus, écrite sur 62 chiffres. Un rang ne finit jamais par le chiffre zéro.
export type Rang = string;

export const BORNE_BASSE = "";
export const BORNE_HAUTE = null;

const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

export function estUnRang(valeur: string): boolean {
  const finitParZero = valeur.endsWith(ALPHABET.charAt(0));
  return (
    valeur !== "" && !finitParZero && [...valeur].every((chiffre) => ALPHABET.includes(chiffre))
  );
}

/** Rang strictement compris entre `bas` et `haut`. Précondition : `bas` précède `haut`. */
export function rangEntre(bas: Rang, haut: Rang | null): Rang {
  const chiffreBas = premierChiffre(bas);
  if (haut !== BORNE_HAUTE && premierChiffre(haut) === chiffreBas) {
    return haut.charAt(0) + rangEntre(bas.slice(1), haut.slice(1));
  }
  const chiffreHaut = haut === BORNE_HAUTE ? ALPHABET.length : premierChiffre(haut);
  if (chiffreHaut - chiffreBas > 1) {
    return ALPHABET.charAt(Math.floor((chiffreBas + chiffreHaut) / 2));
  }
  if (haut !== BORNE_HAUTE && haut.length > 1) {
    return haut.charAt(0);
  }
  // Plus de place à ce chiffre : le rang s'allonge, au-dessus de la suite de `bas`.
  return ALPHABET.charAt(chiffreBas) + rangEntre(bas.slice(1), BORNE_HAUTE);
}

/**
 * Un rang par élément, dans l'ordre : strictement croissants, strictement entre `bas` et `haut`.
 * Précondition : `bas` précède `haut`.
 */
export function rangsCroissantsEntre<T>(
  bas: Rang,
  haut: Rang | null,
  elements: readonly T[],
): Map<T, Rang> {
  const rangs = new Map<T, Rang>();
  let precedent = bas;
  for (const element of elements) {
    precedent = rangEntre(precedent, haut);
    rangs.set(element, precedent);
  }
  return rangs;
}

// Un rang épuisé se prolonge par des zéros, comme une partie fractionnaire.
function premierChiffre(rang: Rang): number {
  return rang === "" ? 0 : ALPHABET.indexOf(rang.charAt(0));
}
