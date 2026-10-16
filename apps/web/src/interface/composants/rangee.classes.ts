// Classes d'une rangée de la barre latérale : une ligne, titre coupé, actions révélées, repère de
// page courante peint avec le dégradé d'accent.
const LIGNE =
  "rangee retrait-niveau flex min-h-cible items-center gap-infime rounded-moyen pr-mince text-interface etroit:pointer-fine:min-h-rangee";

export const RANGEE = {
  element: "list-none px-petit",
  sousPage: "depliage list-none px-petit",
  // Rangée glissée (F-006) : au-dessus des autres, elle suit le geste par `transform`.
  elementGlisse: "relative plan-menu list-none px-petit",
  sousPageGlissee: "depliage relative plan-menu list-none px-petit",
  // Repères de dépôt (F-006-AC1, AC28) : un trait avant ou après la rangée, un contour en tirets
  // pour « dans ».
  depotAvant:
    "pointer-events-none absolute inset-x-nul top-nul h-repere rounded-full bg-repere-focus",
  depotApres:
    "pointer-events-none absolute inset-x-nul bottom-nul h-repere rounded-full bg-repere-focus",
  depotDans: "contour-de-depot pointer-events-none absolute inset-nul rounded-moyen",
  repos: `${LIGNE} text-texte-secondaire hover:bg-surface-survol hover:text-texte-principal`,
  courante: `${LIGNE} bg-surface-active font-moyen text-texte-principal`,
  repere:
    "fond-accent pointer-events-none absolute left-nul top-mince bottom-mince w-repere rounded-full",
  repli:
    "inline-flex size-cible flex-none cursor-pointer items-center justify-center rounded-petit text-texte-discret hover:text-texte-principal etroit:pointer-fine:size-bouton-icone",
  sansRepli: "size-cible flex-none etroit:pointer-fine:size-bouton-icone",
  chevronReplie: "chevron inline-flex",
  chevronDeplie: "chevron chevron-ouvert inline-flex",
  lien: "extensible contour-interieur content-center self-stretch truncate rounded-petit px-mince",
  actions: "actions-de-rangee flex flex-none items-center",
  infobulle:
    "infobulle plan-menu pointer-events-none absolute inset-x-nul top-full mt-infime wrap-anywhere rounded-moyen bg-surface-relief px-petit py-mince text-petit font-normal text-texte-principal shadow-menu filet",
} as const;
