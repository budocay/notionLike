// Classes de l'éditeur de page : le corps de la page dans la colonne de lecture, la zone de saisie
// sans cadre, la barre de blocs flottante, posée près de la sélection sans déplacer le contenu, et
// le panneau de lien, posé sous elle.
export const EDITION = {
  corps: "px-normal pb-immense etroit:px-vaste",
  colonne: "mx-auto flex w-full max-w-lecture flex-col gap-normal",
  zone: "relative",
  saisie: "contenu-de-page saisie-sans-contour wrap-anywhere text-courant text-texte-principal",
  note: "text-courant text-texte-secondaire",
  barre:
    "barre-flottante plan-menu absolute flex max-w-full items-center gap-infime rounded-grand bg-surface-relief p-mince shadow-menu filet",
  commande:
    "contour-interieur inline-flex min-h-cible min-w-cible flex-none cursor-pointer items-center justify-center rounded-moyen px-petit text-interface font-moyen text-texte-secondaire hover:bg-surface-active hover:text-texte-principal aria-disabled:text-texte-discret aria-disabled:hover:bg-transparent etroit:pointer-fine:min-h-rangee etroit:pointer-fine:min-w-rangee",
  commandeActive:
    "contour-interieur inline-flex min-h-cible min-w-cible flex-none cursor-pointer items-center justify-center rounded-moyen bg-surface-active px-petit text-interface font-fort text-texte-principal etroit:pointer-fine:min-h-rangee etroit:pointer-fine:min-w-rangee",
  panneau:
    "panneau-de-lien plan-menu absolute flex w-menu max-w-full flex-col gap-mince rounded-grand bg-surface-relief p-petit shadow-menu filet",
  etiquette: "text-petit font-moyen text-texte-secondaire",
  champ:
    "contour-interieur contour-champ min-h-cible rounded-petit bg-surface-retrait px-mince text-interface text-texte-principal etroit:pointer-fine:min-h-rangee",
  refus: "text-petit text-texte-erreur",
  actions: "flex flex-wrap items-center gap-infime",
  action:
    "contour-interieur inline-flex min-h-cible flex-none cursor-pointer items-center justify-center rounded-moyen px-petit text-interface font-moyen text-texte-secondaire hover:bg-surface-active hover:text-texte-principal aria-disabled:text-texte-discret aria-disabled:hover:bg-transparent etroit:pointer-fine:min-h-rangee",
} as const;
