// Classes du champ de titre : il prend la place du lien dans la rangée, sans en changer la hauteur.
const CHAMP_BASE =
  "contour-interieur h-full w-full rounded-petit bg-surface-retrait px-mince text-interface text-texte-principal";

export const CHAMP = {
  cadre: "extensible relative self-stretch py-infime",
  valide: `${CHAMP_BASE} contour-champ`,
  enErreur: `${CHAMP_BASE} contour-erreur`,
  erreur:
    "plan-menu absolute left-nul top-full mt-mince w-menu max-w-full rounded-moyen bg-surface-relief px-petit py-mince text-petit text-texte-erreur shadow-menu filet",
} as const;
