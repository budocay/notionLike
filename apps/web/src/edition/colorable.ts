// Bornes d'un bloc colorable (F-033 H6, AC9) : au plus 10 000 unités UTF-16 dans le texte, et au
// plus 500 dans chaque ligne. Lues en une passe sur le texte, avant tout appel à la bibliothèque de
// coloration : le coût d'une grammaire croît vite avec une longue suite sans saut de ligne. Aucun
// import : fonction pure.
export const UNITES_PAR_BLOC = 10_000;
export const UNITES_PAR_LIGNE = 500;

/** Pourquoi un texte n'est pas coloré : bloc trop long, ou une ligne trop longue. */
export type RaisonSansColoration = "bloc" | "ligne";

const SAUT_DE_LIGNE = "\n";

/** La raison pour laquelle ce texte ne se colore pas ; `undefined` s'il tient dans les bornes. */
export function raisonSansColoration(texte: string): RaisonSansColoration | undefined {
  if (texte.length > UNITES_PAR_BLOC) {
    return "bloc";
  }
  let debutDeLigne = 0;
  for (let fin = texte.indexOf(SAUT_DE_LIGNE); ; fin = texte.indexOf(SAUT_DE_LIGNE, fin + 1)) {
    const finDeLigne = fin < 0 ? texte.length : fin;
    if (finDeLigne - debutDeLigne > UNITES_PAR_LIGNE) {
      return "ligne";
    }
    if (fin < 0) {
      return undefined;
    }
    debutDeLigne = fin + 1;
  }
}
