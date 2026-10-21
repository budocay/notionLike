// Fenêtre de la grille (F-018-AC46, H9) : les rangées présentes dans le DOM, calculées sans DOM sur
// des rangées de hauteur fixe. Celles qui recoupent la zone visible, plus une marge de chaque côté.

/** Rangées tenues de chaque côté de la zone visible. */
export const MARGE_DE_LA_FENETRE = 10;

export interface Mesures {
  /** Défilement vertical de la zone, en pixels. */
  readonly defilement: number;
  /** Hauteur visible de la zone, en pixels. */
  readonly hauteurZone: number;
  /** Hauteur d'une rangée, la même pour toutes, en pixels. */
  readonly hauteurRangee: number;
  /** Nombre de lignes affichées. */
  readonly nombre: number;
}

/** Indices `[debut, fin)` des rangées présentes ; vide pour une table vide. */
export interface Fenetre {
  readonly debut: number;
  readonly fin: number;
}

export function fenetre({ defilement, hauteurZone, hauteurRangee, nombre }: Mesures): Fenetre {
  if (nombre <= 0) {
    return { debut: 0, fin: 0 };
  }
  const hauteur = Math.max(1, hauteurRangee);
  const haut = Math.max(0, defilement);
  const premiere = Math.min(nombre - 1, Math.floor(haut / hauteur));
  const derniere = Math.max(premiere + 1, Math.ceil((haut + Math.max(0, hauteurZone)) / hauteur));
  return {
    debut: Math.max(0, premiere - MARGE_DE_LA_FENETRE),
    fin: Math.min(nombre, derniere + MARGE_DE_LA_FENETRE),
  };
}

/**
 * Indices des rangées à rendre, croissants : la fenêtre, plus celles que la grille tient hors d'elle
 * (la cellule courante, la cellule en mode édition, AC47).
 */
export function indicesRendus(fenetreCourante: Fenetre, tenues: readonly number[]): number[] {
  const indices = new Set<number>();
  for (let indice = fenetreCourante.debut; indice < fenetreCourante.fin; indice += 1) {
    indices.add(indice);
  }
  tenues.filter((tenue) => tenue >= 0).forEach((tenue) => indices.add(tenue));
  return [...indices].sort((a, b) => a - b);
}

/** Défilement qui amène la rangée dans la zone, ou `undefined` si elle y est déjà entière. */
export function defilementPour(
  indice: number,
  { defilement, hauteurZone, hauteurRangee }: Omit<Mesures, "nombre">,
): number | undefined {
  const haut = indice * hauteurRangee;
  const bas = haut + hauteurRangee;
  if (haut < defilement) {
    return haut;
  }
  if (bas > defilement + hauteurZone) {
    return Math.max(0, bas - hauteurZone);
  }
  return undefined;
}
