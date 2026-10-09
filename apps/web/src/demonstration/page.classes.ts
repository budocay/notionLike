// Classes de la page de démonstration : sa mise en page, pas celle des composants montrés. La
// coquille est le composant de l'application, posé dans un aperçu qui lui donne sa hauteur.
export const PAGE = {
  cadre:
    "mx-auto flex w-full max-w-page flex-col gap-vaste px-normal py-grand etroit:px-grand etroit:py-vaste",
  entete: "flex flex-col gap-petit",
  enseigne: "flex items-center gap-petit text-interface font-moyen text-texte-secondaire",
  titre: "text-titre-etroit font-titre text-texte-principal etroit:text-titre",
  section: "flex flex-col gap-normal",
  sectionTitre:
    "filet-bas pb-petit text-etiquette font-fort uppercase tracking-etiquette text-texte-discret",
  grille: "grille-auto grid items-start gap-ample",
  specimen: "flex min-w-nul flex-col gap-petit",
  etiquette: "text-petit text-texte-discret",
  fondBarre: "relative rounded-grand bg-surface-retrait py-petit filet",
  fondBarreHaut: "relative rounded-grand bg-surface-retrait pt-petit pb-apercu-menu filet",
  fondZone: "overflow-hidden rounded-grand bg-surface-application filet",
  fondLibre:
    "flex flex-wrap items-center gap-moyen rounded-grand bg-surface-application p-normal filet",
  liste: "flex flex-col gap-infime",
  apercu: "h-apercu overflow-hidden rounded-grand shadow-menu filet",
  apercuDuTiroir: "repere-des-fixes h-apercu overflow-hidden rounded-grand filet",
  filLarge: "extensible hidden etroit:flex",
  filEtroit: "extensible flex etroit:hidden",
  ouvertureEtroite: "flex flex-none etroit:hidden",
  ecran: "flex justify-center rounded-grand bg-surface-application p-normal filet",
} as const;

export const ECHANTILLONS = {
  grille: "grille-auto grid gap-normal",
  carte: "flex min-w-nul flex-col overflow-hidden rounded-grand bg-surface-relief filet",
  pastille: "filet-bas h-vaste w-full",
  degrade: "h-immense w-full",
  legende: "flex flex-col gap-infime px-moyen py-petit",
  nom: "truncate text-interface font-moyen text-texte-principal",
  valeur: "text-petit text-texte-discret tabular-nums",
  texte: "px-moyen pt-moyen text-intertitre font-fort",
  echelle: "flex flex-col gap-normal rounded-grand bg-surface-application p-normal filet",
  ligne: "flex flex-col gap-infime",
  exemple: "truncate text-texte-principal",
} as const;
