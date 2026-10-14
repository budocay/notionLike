// Textes de l'écran de la corbeille (F-007). Les noms composés autour d'un titre sont dans
// messages.ts, où chacun passe par titreCite (F-004-AC57).
export const ENTREE_CORBEILLE = "Corbeille";
export const CORBEILLE_VIDE = "La corbeille est vide";
export const PAGES_DE_LA_CORBEILLE = "Pages de la corbeille";
export const RESTAURER = "Restaurer";
export const SUPPRIMER_DEFINITIVEMENT = "Supprimer définitivement";
export const ANNULER_LA_SUPPRESSION = "Annuler";
export const PAGE_RESTAUREE = "Page restaurée";
export const PAGE_SUPPRIMEE = "Page supprimée définitivement";
/** Avertissement quand une base de page n'a pas pu être effacée (F-007-AC21). */
export const CONTENU_NON_EFFACE =
  "La suppression est faite, mais le contenu de ces pages n'a pas pu être effacé de cet appareil.";

export function nombreDeSousPages(nombre: number): string {
  if (nombre === 0) {
    return "Aucune sous-page";
  }
  return nombre === 1 ? "1 sous-page" : `${nombre} sous-pages`;
}

/** Ce que la suppression emporte, nombre de sous-pages compris, et qu'elle est irréversible (F-007-AC9). */
export function texteDeLaConfirmation(sousPages: number): readonly string[] {
  const avec = sousPages === 1 ? "sa sous-page" : `ses ${sousPages} sous-pages`;
  return [
    sousPages === 0
      ? "Cette page sera supprimée de l'application et de cet appareil."
      : `Cette page et ${avec} seront supprimées de l'application et de cet appareil.`,
    "Cette action est irréversible : la page ne pourra plus être restaurée.",
  ];
}
