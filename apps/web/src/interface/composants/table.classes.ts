// Classes de l'écran de table (F-018) : barre d'outils, invitation, grille à rangées de hauteur fixe
// placées par `transform`, en-têtes à séparateur de largeur, cellules, champs, liste de choix et
// panneau d'options. La géométrie que la fenêtre et les largeurs calculent est posée en ligne
// (`width`, `height`, `transform`, AC55) ; tout le reste vient des jetons de F-004.

export const TABLE = {
  ecran: "flex flex-col gap-moyen px-normal pb-immense etroit:px-vaste",
  outils: "flex flex-wrap items-center gap-petit",
  annonce: "sr-only",
  alerte: "text-interface text-texte-erreur",
  invitation: "flex flex-col items-start gap-moyen rounded-grand bg-surface-relief p-ample filet",
  invitationTexte: "text-courant text-texte-secondaire",
} as const;
