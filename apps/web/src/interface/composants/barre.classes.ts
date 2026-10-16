// Classes de la barre latérale : tête et pied fixes, l'arborescence défile seule entre les deux.
export const BARRE = {
  cadre: "flex h-full w-full flex-col bg-surface-retrait text-interface",
  tete: "flex flex-none flex-col gap-moyen px-petit pt-moyen pb-petit",
  enseigne: "flex items-center gap-petit px-mince",
  nom: "extensible truncate text-interface font-fort tracking-serre text-texte-principal",
  sceau: "fond-accent relative size-sceau flex-none overflow-hidden rounded-moyen",
  sceauEncoche: "absolute right-nul bottom-nul size-moyen rounded-tl-petit bg-surface-retrait",
  nouvellePage:
    "flex min-h-cible w-full cursor-pointer items-center gap-petit rounded-moyen bg-surface-relief px-petit text-left text-interface font-moyen text-texte-principal shadow-relief filet hover:bg-surface-survol etroit:pointer-fine:min-h-rangee",
  nouvellePageLibelle: "extensible truncate",
  defilement: "extensible overflow-y-auto overflow-x-hidden py-mince",
  liste: "flex flex-col gap-infime",
  pied: "filet-haut flex flex-none flex-col px-petit py-petit",
  message: "px-moyen py-petit text-petit text-texte-erreur",
  annonce: "sr-only",
} as const;
