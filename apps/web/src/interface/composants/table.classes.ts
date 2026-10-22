// Classes de l'écran de table (F-018) : barre d'outils, invitation, grille à rangées de hauteur fixe
// placées par `transform`, en-têtes à séparateur de largeur, cellules, champs, liste de choix et
// panneau d'options. La géométrie que la fenêtre et les largeurs calculent est posée en ligne
// (`width`, `height`, `transform`, AC55) ; tout le reste vient des jetons de F-004.
const CIBLE = "min-h-cible etroit:pointer-fine:min-h-rangee";
const CELLULE =
  "contour-interieur relative flex h-full flex-none items-center gap-mince px-petit filet-droit";
// L'invite d'un champ vide (« Sans libellé », AC22) prend un jeton de texte réel : 4,5 pour 1 sur
// chaque surface (F-004-AC7).
const CHAMP =
  "contour-interieur h-full w-full rounded-petit bg-surface-retrait px-mince text-interface text-texte-principal placeholder:text-texte-discret";

export const TABLE = {
  // Bornée à la zone principale : une grille plus large défile dans sa propre zone (min-w-nul).
  ecran: "flex min-w-nul flex-col gap-moyen px-normal pb-immense etroit:px-vaste",
  outils: "flex flex-wrap items-center gap-petit",
  annonce: "sr-only",
  alerte: "text-interface text-texte-erreur",
  note: "text-courant text-texte-secondaire",
  invitation: "flex flex-col items-start gap-moyen rounded-grand bg-surface-relief p-ample filet",
  invitationTexte: "text-courant text-texte-secondaire",
  // Sélecteur de vues (AC44) : un groupe d'onglets, la vue active marquée par un filet sous elle.
  vues: "flex items-center gap-mince",
  vue: `${CIBLE} cursor-pointer rounded-moyen px-petit text-interface text-texte-secondaire hover:bg-surface-survol`,
  vueActive: `${CIBLE} cursor-pointer rounded-moyen px-petit text-interface font-fort text-texte-principal underline`,
  // Grille : le cadre porte la couche des surfaces flottantes, que la zone défilante ne coupe pas.
  cadre: "relative min-w-nul",
  grille: "rounded-grand bg-surface-relief filet",
  defilement: "relative overflow-auto",
  enTetes:
    "sticky top-nul plan-barre-haut flex bg-surface-relief text-petit font-fort text-texte-secondaire filet-bas",
  // Les en-têtes, en ligne comme les cellules d'une rangée.
  enTetesRangee: "flex",
  corps: "relative",
  rangee: "absolute left-nul top-nul flex text-interface text-texte-principal filet-bas",
  enTete: CELLULE,
  cellule: CELLULE,
  celluleDActions: `${CELLULE} justify-between text-petit text-texte-discret`,
  texte: "extensible truncate",
  caseACocher: "size-icone cursor-pointer",
  champ: `${CHAMP} contour-champ`,
  champEnErreur: `${CHAMP} contour-erreur`,
  separateur:
    "absolute -right-mince top-nul plan-menu h-full w-petit cursor-pointer hover:bg-repere-focus focus-visible:bg-repere-focus",
  // Surface flottante : posée sur la commande qui l'ouvre, au-dessus de la zone défilante.
  flottante: "pointer-events-none absolute left-nul top-nul plan-menu",
  flottanteContenu: "pointer-events-auto",
  choix:
    "depliage absolute left-nul top-full mt-mince flex w-menu max-w-full flex-col rounded-grand bg-surface-relief p-mince shadow-menu filet",
  option: `contour-interieur flex ${CIBLE} w-full cursor-pointer items-center justify-between gap-normal rounded-moyen px-petit text-left text-interface text-texte-principal hover:bg-surface-active`,
  optionActive: `contour-interieur flex ${CIBLE} w-full cursor-pointer items-center justify-between gap-normal rounded-moyen bg-surface-active px-petit text-left text-interface text-texte-principal`,
  optionCourante: "font-fort",
  // Champs des boîtes : nouvelle colonne, options d'une colonne.
  champDeFormulaire: "flex flex-col gap-mince",
  etiquette: "text-interface font-moyen text-texte-secondaire",
  saisie: `contour-interieur ${CIBLE} w-full rounded-petit bg-surface-retrait px-petit text-interface text-texte-principal contour-champ aria-invalid:contour-erreur`,
  faute: "text-petit text-texte-erreur",
  options: "flex flex-col gap-petit",
  ligneDOption: "flex items-center gap-mince",
} as const;
