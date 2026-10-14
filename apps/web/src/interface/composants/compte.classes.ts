// Classes de la zone et des écrans de compte (F-010) : rien que des jetons et des classes nommées
// déjà déclarés par F-004. Toute action est une cible de 44 pixels, comme les autres (F-004-AC43).
const CIBLE =
  "contour-interieur flex min-h-cible w-full cursor-pointer items-center rounded-moyen px-petit text-interface disabled:cursor-default disabled:text-texte-discret etroit:pointer-fine:min-h-rangee";

export const COMPTE = {
  zone: "flex flex-col gap-mince",
  etat: "flex flex-col gap-infime px-petit text-petit text-texte-secondaire wrap-anywhere",
  actions: "flex flex-col gap-infime",
  action: `${CIBLE} text-left text-texte-principal hover:bg-surface-active`,
  actionCourante: `${CIBLE} bg-surface-active text-left font-moyen text-texte-principal`,
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

// Classes des écrans des espaces, des membres et des invitations (F-014) : mêmes jetons, mêmes
// cibles que le compte, rien d'ajouté à leur source unique. Un rôle, un état ou une erreur sont
// toujours dits par un texte, jamais par la seule couleur (F-014-AC36).
export const ESPACES = {
  enveloppe: "flex w-full justify-center px-normal pt-vaste pb-grand",
  ecran: "flex w-full max-w-lecture flex-col gap-ample",
  titre: "wrap-anywhere text-intertitre font-fort tracking-serre text-texte-principal",
  partie: "flex flex-col gap-moyen rounded-grand bg-surface-relief p-ample shadow-relief filet",
  intertitre: "text-interface font-fort text-texte-principal",
  texte: "wrap-anywhere text-courant text-texte-secondaire",
  annonce: "wrap-anywhere text-interface text-texte-secondaire",
  alerte: "flex flex-col gap-mince wrap-anywhere text-interface text-texte-erreur",
  actions: "flex flex-wrap items-center gap-petit",
  bouton: `${CIBLE} w-auto bg-surface-active font-moyen text-texte-principal hover:bg-surface-survol`,
  lien: `${CIBLE} w-auto text-texte-principal underline hover:bg-surface-active`,
  raison: "text-petit text-texte-secondaire",
  tableau: "contour-interieur w-full text-left text-interface",
  legende: "sr-only",
  entete: "filet-bas px-petit py-mince text-petit font-moyen text-texte-secondaire",
  cellule: "filet-bas wrap-anywhere px-petit py-mince text-texte-principal",
  choix:
    "contour-interieur min-h-cible rounded-petit bg-surface-retrait px-petit text-interface text-texte-principal contour-champ",
  formulaire: "flex flex-col gap-moyen",
  plan: "plan-tiroir fixed inset-nul flex items-center justify-center p-normal",
  voile: "voile absolute inset-nul shadow-voile",
  boite:
    "relative flex max-h-full w-full max-w-ecran flex-col gap-moyen overflow-y-auto rounded-grand bg-surface-relief p-ample shadow-menu filet",
  lienLu:
    "contour-interieur min-h-cible w-full rounded-petit bg-surface-retrait px-petit text-interface text-texte-principal contour-champ",
} as const;

// Classes de l'écran de la corbeille (F-007) : mêmes jetons et mêmes surfaces que les écrans des
// espaces ; la descendance d'une racine est retirée selon son niveau, comme dans la barre latérale.
export const CORBEILLE = {
  zone: "contour-interieur flex flex-col gap-moyen rounded-moyen",
  vide: "text-courant text-texte-secondaire",
  racines: "flex flex-col gap-moyen",
  racine: "flex flex-col gap-mince rounded-grand bg-surface-relief p-normal shadow-relief filet",
  descendance: "flex flex-col gap-infime",
  descendante: "retrait-niveau list-none",
  ligne: "flex flex-wrap items-center gap-petit",
  titre: "extensible wrap-anywhere text-interface font-moyen text-texte-principal",
  detail: "text-petit text-texte-secondaire",
  actions: "flex flex-wrap items-center gap-petit",
} as const;
