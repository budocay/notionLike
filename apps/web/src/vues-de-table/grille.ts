// Ce que les composants de la vue « Tableau » partagent (F-018-AC18 à AC47) : géométrie fixe, mode
// édition, boîtes ouvertes. Aucune donnée du document n'y est tenue : la table lue vient de la
// façade à chaque rendu.
import type { IdColonne, IdLigne } from "@notionlike/document";

/** Hauteur de toutes les rangées, en pixels : celle du jeton `--spacing-rangee` (2rem). */
export const HAUTEUR_DE_RANGEE = 32;
/** Largeur de la colonne des actions de ligne, en pixels. */
export const LARGEUR_DES_ACTIONS = 144;
/**
 * Hauteur de la zone défilante : celle du contenu, plus la place d'une barre de défilement
 * horizontale qui ne doit pas recouvrir la dernière rangée, bornée sous la fenêtre du navigateur.
 */
export function hauteurDeLaZone(nombreDeRangees: number): string {
  const contenu = `${String(nombreDeRangees * HAUTEUR_DE_RANGEE)}px + var(--spacing-normal)`;
  return `min(calc(${contenu}), calc(100dvh - var(--spacing-halo)))`;
}

/** Le mode édition : une cellule (texte, nombre, date), une liste de choix, ou un nom de colonne. */
export type Edition =
  | {
      readonly sorte: "champ";
      readonly ligne: IdLigne;
      readonly colonne: IdColonne;
      readonly texte: string;
      readonly erreur: string | undefined;
    }
  | {
      readonly sorte: "choix";
      readonly ligne: IdLigne;
      readonly colonne: IdColonne;
      readonly active: number;
    }
  | {
      readonly sorte: "nom";
      readonly colonne: IdColonne;
      readonly texte: string;
      readonly erreur: string | undefined;
    };

/**
 * Où va la cellule courante après une validation (AC33) ; « sortie » : le focus a quitté le champ,
 * il reste où il est allé.
 */
export type Suite = "rester" | "descendre" | "suivante" | "precedente" | "sortie";

/** La boîte de dialogue ouverte. */
export type Boite =
  | { readonly sorte: "nouvelle-colonne" }
  | { readonly sorte: "supprimer-colonne"; readonly colonne: IdColonne }
  | { readonly sorte: "supprimer-ligne"; readonly ligne: IdLigne }
  | { readonly sorte: "options"; readonly colonne: IdColonne };
