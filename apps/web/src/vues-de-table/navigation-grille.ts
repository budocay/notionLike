// Navigation de cellule en cellule (F-018-AC33, AC24) : la table des touches et le déplacement de la
// cellule courante, sans DOM ni boucle. Une position compte la rangée d'en-têtes (rang 0) puis les
// lignes affichées (rangs 1 à n), la colonne des actions de ligne (colonne 0) puis les colonnes de
// la table (colonnes 1 à m). Les combinaisons sont celles de la déclaration des raccourcis.
import { type Combinaison, estLaFrappe, TOUCHES_DE_LA_GRILLE } from "../interface/raccourcis.ts";

export type Deplacement =
  | "haut"
  | "bas"
  | "gauche"
  | "droite"
  | "debut-de-ligne"
  | "fin-de-ligne"
  | "premiere-cellule"
  | "derniere-cellule"
  | "page-precedente"
  | "page-suivante";

export interface Position {
  readonly rang: number;
  readonly colonne: number;
}

export interface Dimensions {
  /** Nombre de lignes affichées. */
  readonly lignes: number;
  /** Nombre de colonnes de la table. */
  readonly colonnes: number;
  /** Rangées d'une hauteur de fenêtre, une au moins. */
  readonly parPage: number;
}

type Frappe = Parameters<typeof estLaFrappe>[0];

// Chaque combinaison déclarée de la grille, sous le déplacement qu'elle demande.
const DEPLACEMENTS: readonly (readonly [Combinaison, Deplacement])[] = [
  [TOUCHES_DE_LA_GRILLE.haut, "haut"],
  [TOUCHES_DE_LA_GRILLE.bas, "bas"],
  [TOUCHES_DE_LA_GRILLE.gauche, "gauche"],
  [TOUCHES_DE_LA_GRILLE.droite, "droite"],
  [TOUCHES_DE_LA_GRILLE.debutDeLigne, "debut-de-ligne"],
  [TOUCHES_DE_LA_GRILLE.finDeLigne, "fin-de-ligne"],
  [TOUCHES_DE_LA_GRILLE.premiereCellule, "premiere-cellule"],
  [TOUCHES_DE_LA_GRILLE.derniereCellule, "derniere-cellule"],
  [TOUCHES_DE_LA_GRILLE.pagePrecedente, "page-precedente"],
  [TOUCHES_DE_LA_GRILLE.pageSuivante, "page-suivante"],
];

export function deplacementDeLaFrappe(frappe: Frappe): Deplacement | undefined {
  return DEPLACEMENTS.find(([combinaison]) => estLaFrappe(frappe, combinaison))?.[1];
}

export function estUneDesFrappes(frappe: Frappe, combinaisons: readonly Combinaison[]): boolean {
  return combinaisons.some((combinaison) => estLaFrappe(frappe, combinaison));
}

function borner(valeur: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, valeur));
}

// Première ligne et première colonne de la table : la rangée d'en-têtes et la colonne des actions
// ne comptent pas pour Début, Fin, Mod+Début et Mod+Fin.
function premiereDonnee(nombre: number): number {
  return nombre > 0 ? 1 : 0;
}

type Regle = (position: Position, dimensions: Dimensions & { readonly page: number }) => Position;

// Une règle par déplacement : chacune borne la position à la grille, aucune ne boucle.
const REGLES: Readonly<Record<Deplacement, Regle>> = {
  haut: ({ rang, colonne }, { lignes }) => ({ rang: borner(rang - 1, 0, lignes), colonne }),
  bas: ({ rang, colonne }, { lignes }) => ({ rang: borner(rang + 1, 0, lignes), colonne }),
  gauche: ({ rang, colonne }, { colonnes }) => ({
    rang,
    colonne: borner(colonne - 1, 0, colonnes),
  }),
  droite: ({ rang, colonne }, { colonnes }) => ({
    rang,
    colonne: borner(colonne + 1, 0, colonnes),
  }),
  "debut-de-ligne": ({ rang }, { colonnes }) => ({ rang, colonne: premiereDonnee(colonnes) }),
  "fin-de-ligne": ({ rang }, { colonnes }) => ({ rang, colonne: colonnes }),
  "premiere-cellule": (_position, { lignes, colonnes }) => ({
    rang: premiereDonnee(lignes),
    colonne: premiereDonnee(colonnes),
  }),
  "derniere-cellule": (_position, { lignes, colonnes }) => ({ rang: lignes, colonne: colonnes }),
  // Une page plus haut ne quitte pas les lignes pour la rangée d'en-têtes.
  "page-precedente": ({ rang, colonne }, { lignes, page }) => ({
    rang: borner(rang - page, Math.min(rang, premiereDonnee(lignes)), lignes),
    colonne,
  }),
  "page-suivante": ({ rang, colonne }, { lignes, page }) => ({
    rang: borner(rang + page, 0, lignes),
    colonne,
  }),
};

/** La position où mène le déplacement, sans sortir de la grille ni boucler. */
export function deplacer(
  position: Position,
  deplacement: Deplacement,
  dimensions: Dimensions,
): Position {
  return REGLES[deplacement](position, { ...dimensions, page: Math.max(1, dimensions.parPage) });
}
