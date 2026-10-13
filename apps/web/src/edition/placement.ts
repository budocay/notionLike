// Position de la barre de blocs (F-003-AC41) : un calcul pur sur des rectangles mesurés. Au-dessus
// de la sélection s'il y a la place, sinon au-dessous ; jamais sur elle, jamais hors de la fenêtre.

/** Bords d'un rectangle, en pixels depuis le coin haut gauche de la fenêtre. */
export interface Bords {
  readonly gauche: number;
  readonly haut: number;
  readonly bas: number;
}

export interface Mesures {
  readonly selection: Bords;
  /** Coin de la zone d'édition, repère de la position rendue. */
  readonly zone: Pick<Bords, "gauche" | "haut">;
  readonly barre: { readonly largeur: number; readonly hauteur: number };
  readonly fenetre: { readonly largeur: number; readonly hauteur: number };
  /** Bord haut de ce qui est visible de la page : sous la barre du haut. */
  readonly hautVisible: number;
}

/** Coin haut gauche de la barre, en pixels depuis celui de la zone d'édition. */
export interface Placement {
  readonly gauche: number;
  readonly haut: number;
}

const ECART_AVEC_LA_SELECTION = 8;
const MARGE_DE_FENETRE = 8;

export function placerLaBarre(mesures: Mesures): Placement {
  const { selection, zone, barre, fenetre, hautVisible } = mesures;
  const auDessus = selection.haut - barre.hauteur - ECART_AVEC_LA_SELECTION;
  const auDessous = selection.bas + ECART_AVEC_LA_SELECTION;
  const tientAuDessus = auDessus >= hautVisible + MARGE_DE_FENETRE;
  const tientAuDessous = auDessous + barre.hauteur <= fenetre.hauteur - MARGE_DE_FENETRE;
  const haut = tientAuDessus || !tientAuDessous ? auDessus : auDessous;
  const gaucheMax = fenetre.largeur - barre.largeur - MARGE_DE_FENETRE;
  const gauche = Math.max(MARGE_DE_FENETRE, Math.min(selection.gauche, gaucheMax));
  return { gauche: gauche - zone.gauche, haut: haut - zone.haut };
}
