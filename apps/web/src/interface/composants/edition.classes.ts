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
  // Poignée d'un bloc (F-006-AC14) : à gauche du bloc, hors du contenu ; celle du curseur est posée
  // par le module d'édition au bord haut du bloc courant. Le geste à la souris est celui d'un écran
  // large sous pointeur fin : ailleurs (écran étroit, saisie tactile, hors périmètre), la poignée
  // n'est pas rendue visible, et le bloc se déplace par la barre de blocs et le clavier.
  poignee:
    "poignee-de-bloc contour-interieur hidden size-bouton-icone items-center justify-center rounded-petit text-texte-discret hover:bg-surface-survol hover:text-texte-principal etroit:pointer-fine:inline-flex",
  poigneeDuCurseur:
    "poignee-du-curseur contour-interieur absolute hidden size-bouton-icone items-center justify-center rounded-petit text-texte-discret etroit:pointer-fine:inline-flex",
  // Sélecteur de langage du bloc code, dans la barre de blocs (F-005-AC6).
  selecteur:
    "contour-interieur min-h-cible flex-none cursor-pointer rounded-moyen bg-surface-retrait px-petit text-interface font-moyen text-texte-principal hover:bg-surface-active etroit:pointer-fine:min-h-rangee",
  // Menu slash (F-005-AC12) : posé dans la fenêtre près du curseur, aux coordonnées que le module
  // d'édition mesure ; invisible tant qu'il ne l'est pas.
  menu: "menu-slash plan-menu fixed flex w-menu max-w-full flex-col gap-infime rounded-grand bg-surface-relief p-mince shadow-menu filet",
  menuEnMesure:
    "menu-slash plan-menu invisible fixed flex w-menu max-w-full flex-col gap-infime rounded-grand bg-surface-relief p-mince shadow-menu filet",
  listeDuMenu: "flex flex-col gap-infime",
  option:
    "flex min-h-cible cursor-pointer items-center rounded-moyen px-petit text-interface font-moyen text-texte-secondaire hover:bg-surface-survol hover:text-texte-principal etroit:pointer-fine:min-h-rangee",
  optionActive:
    "flex min-h-cible cursor-pointer items-center rounded-moyen bg-surface-active px-petit text-interface font-fort text-texte-principal etroit:pointer-fine:min-h-rangee",
  menuVide: "px-petit py-mince text-interface text-texte-discret",
  // Région d'état de l'éditeur : lue par les technologies d'assistance, hors de la vue.
  annonce: "sr-only",
  // Curseur de dépôt de l'éditeur (F-006-AC37) : sa couleur est celle de cette classe.
  curseurDeDepot: "curseur-de-depot",
  // Classes de rôle du bloc code (F-033-AC6, AC13) : la liste fermée, déclarée ici seulement ; la
  // coloration ne pose qu'elles, et chacune n'est habillée que par son jeton de rôle.
  syntaxeMotCle: "syntaxe-mot-cle",
  syntaxeChaine: "syntaxe-chaine",
  syntaxeNombre: "syntaxe-nombre",
  syntaxeCommentaire: "syntaxe-commentaire",
  syntaxeFonction: "syntaxe-fonction",
  syntaxeType: "syntaxe-type",
  syntaxePropriete: "syntaxe-propriete",
  action:
    "contour-interieur inline-flex min-h-cible flex-none cursor-pointer items-center justify-center rounded-moyen px-petit text-interface font-moyen text-texte-secondaire hover:bg-surface-active hover:text-texte-principal aria-disabled:text-texte-discret aria-disabled:hover:bg-transparent etroit:pointer-fine:min-h-rangee",
} as const;
