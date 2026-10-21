// Zone de dépôt survolée (F-006-AC1) : un calcul pur sur le rectangle de la rangée cible et la
// hauteur du point qui glisse. Quart haut : « avant » ; quart bas : « après » ; milieu : « dans ».

export type ZoneDeDepot = "avant" | "apres" | "dans";

/** Bords verticaux d'une rangée, en pixels depuis le haut de la fenêtre. */
export interface BordsVerticaux {
  readonly haut: number;
  readonly hauteur: number;
}

const QUART = 0.25;

export function zoneDuPoint(cible: BordsVerticaux, ordonnee: number): ZoneDeDepot {
  const relative = cible.hauteur <= 0 ? QUART * 2 : (ordonnee - cible.haut) / cible.hauteur;
  if (relative < QUART) {
    return "avant";
  }
  return relative > 1 - QUART ? "apres" : "dans";
}
