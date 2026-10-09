// Classes d'une rangée de la barre latérale : une ligne, titre coupé, actions révélées, repère de
// page courante peint avec le dégradé d'accent.
const LIGNE =
  "rangee retrait-niveau flex min-h-cible items-center gap-infime rounded-moyen pr-mince text-interface etroit:min-h-rangee";

export const RANGEE = {
  element: "list-none px-petit",
  repos: `${LIGNE} text-texte-secondaire hover:bg-surface-survol hover:text-texte-principal`,
  courante: `${LIGNE} bg-surface-active font-moyen text-texte-principal`,
  repere:
    "fond-accent pointer-events-none absolute left-nul top-mince bottom-mince w-repere rounded-full",
  repli:
    "inline-flex size-cible flex-none cursor-pointer items-center justify-center rounded-petit text-texte-discret hover:text-texte-principal etroit:size-bouton-icone",
  sansRepli: "size-cible flex-none etroit:size-bouton-icone",
  chevronReplie: "chevron inline-flex",
  chevronDeplie: "chevron chevron-ouvert inline-flex",
  lien: "extensible contour-interieur content-center self-stretch truncate rounded-petit px-mince",
  actions: "actions-de-rangee flex flex-none items-center",
} as const;
