// Classes de la zone et des écrans de compte (F-010) : rien que des jetons et des classes nommées
// déjà déclarés par F-004. Toute action est une cible de 44 pixels, comme les autres (F-004-AC43).
const CIBLE =
  "contour-interieur flex min-h-cible w-full cursor-pointer items-center rounded-moyen px-petit text-interface disabled:cursor-default disabled:text-texte-discret etroit:pointer-fine:min-h-rangee";

export const COMPTE = {
  zone: "flex flex-col gap-mince",
  etat: "flex flex-col gap-infime px-petit text-petit text-texte-secondaire wrap-anywhere",
  actions: "flex flex-col gap-infime",
  action: `${CIBLE} text-left text-texte-principal hover:bg-surface-active`,
  enveloppe: "flex w-full justify-center px-normal pt-vaste pb-grand",
  formulaire:
    "flex w-full max-w-ecran flex-col gap-moyen rounded-grand bg-surface-relief p-ample shadow-relief filet",
  titre: "text-intertitre font-fort tracking-serre text-texte-principal",
  texte: "text-courant text-texte-secondaire",
  champ: "flex flex-col gap-mince",
  etiquette: "flex items-baseline gap-petit text-interface font-moyen text-texte-principal",
  marque: "text-petit font-normal text-texte-secondaire",
  saisie:
    "contour-interieur min-h-cible w-full rounded-petit bg-surface-retrait px-petit text-interface text-texte-principal contour-champ aria-invalid:contour-erreur",
  faute: "text-petit text-texte-erreur",
  envoi: `${CIBLE} justify-center bg-surface-active font-fort text-texte-principal shadow-relief filet hover:bg-surface-survol`,
  attente: "text-petit text-texte-secondaire",
  alerte: "flex flex-col gap-mince text-interface text-texte-erreur wrap-anywhere",
} as const;
