// Classes de la barre du haut : fil d'Ariane sur une ligne, zone d'état à droite.
export const HAUT = {
  cadre:
    "filet-bas plan-barre-haut relative flex h-barre-haut flex-none items-center gap-petit bg-surface-application px-petit text-interface etroit:px-normal",
  fil: "extensible",
  liste: "flex items-center gap-infime",
  element: "flex min-w-cible items-center gap-infime",
  elementCourant: "flex min-w-fil-courant grow basis-nul items-center",
  elementFixe: "flex flex-none items-center gap-infime",
  lien: "contour-interieur content-center block min-h-cible min-w-cible max-w-fil truncate rounded-petit px-mince text-texte-discret hover:text-texte-principal etroit:pointer-fine:min-h-rangee",
  intermediaires:
    "depliage plan-menu absolute left-petit right-petit top-full mt-mince flex max-h-liste max-w-menu flex-col overflow-y-auto rounded-grand bg-surface-relief p-mince shadow-menu filet",
  intermediaire:
    "contour-interieur content-center block min-h-cible truncate rounded-moyen px-petit text-texte-principal hover:bg-surface-active etroit:pointer-fine:min-h-rangee",
  courante: "block truncate px-mince font-moyen text-texte-principal",
  separateur: "flex-none text-texte-discret",
  etat: "flex flex-none items-center gap-petit whitespace-nowrap text-petit text-texte-erreur",
  pastille: "size-pastille flex-none rounded-full bg-repere-erreur",
  etatAffirme:
    "flex flex-none items-center gap-petit whitespace-nowrap text-petit text-texte-secondaire",
  pastilleAffirmee: "size-pastille flex-none rounded-full bg-repere-contour",
  annonce: "sr-only",
} as const;
