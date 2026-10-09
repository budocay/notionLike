// Classes du champ de titre : il prend la place du lien dans la rangée, sans en changer la hauteur.
// Il est une cible comme les autres : toute la hauteur de la rangée sous le seuil étroit ou au
// pointeur imprécis, un liseré au-dessus et au-dessous pour la rangée compacte seulement.
const CHAMP_BASE =
  "contour-interieur h-full w-full rounded-petit bg-surface-retrait px-mince text-interface text-texte-principal";

export const CHAMP = {
  cadre: "extensible relative self-stretch etroit:pointer-fine:py-infime",
  valide: `${CHAMP_BASE} contour-champ`,
  enErreur: `${CHAMP_BASE} contour-erreur`,
  erreur:
    "plan-menu absolute left-nul top-full mt-mince w-menu max-w-full rounded-moyen bg-surface-relief px-petit py-mince text-petit text-texte-erreur shadow-menu filet",
} as const;
