// Classes des états de la zone principale et des écrans pleins.
export const ETATS = {
  chargement: "flex items-center gap-moyen text-interface text-texte-secondaire",
  points: "flex items-center gap-mince",
  point: "indicateur-chargement size-pastille rounded-full bg-repere-contour",
  pointSuivant: "indicateur-chargement retard-court size-pastille rounded-full bg-repere-contour",
  pointDernier: "indicateur-chargement retard-long size-pastille rounded-full bg-repere-contour",
  avertissement:
    "filet-bas flex items-start gap-moyen bg-surface-relief px-normal py-moyen text-interface text-texte-avertissement",
  avertissementRepere: "mt-infime flex-none text-repere-avertissement",
  ecranBloquant:
    "flex w-full max-w-ecran flex-col gap-moyen rounded-grand bg-surface-relief p-ample shadow-relief filet",
  ecranTitre: "text-intertitre font-fort tracking-serre text-texte-principal",
  ecranExplication: "text-courant text-texte-secondaire",
  zone: "apparition relative flex flex-col px-normal pt-vaste pb-grand etroit:px-vaste etroit:pt-immense",
  halo: "fond-halo pointer-events-none absolute inset-x-nul top-nul h-halo",
  contenu: "relative flex w-full max-w-lecture flex-col gap-normal",
  titre: "wrap-anywhere text-titre-etroit font-titre text-texte-principal etroit:text-titre",
  explication: "text-courant text-texte-secondaire",
} as const;
