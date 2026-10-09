// Classes de la barre du haut : fil d'Ariane sur une ligne, zone d'état à droite.
export const HAUT = {
  cadre:
    "filet-bas plan-barre-haut flex h-barre-haut flex-none items-center gap-petit bg-surface-application px-petit text-interface etroit:px-normal",
  fil: "extensible",
  liste: "flex items-center gap-infime",
  element: "flex min-w-nul items-center gap-infime",
  elementFixe: "flex flex-none items-center gap-infime",
  lien: "contour-interieur content-center block min-h-cible max-w-fil truncate rounded-petit px-mince text-texte-discret hover:text-texte-principal etroit:min-h-rangee",
  courante: "block truncate px-mince font-moyen text-texte-principal",
  separateur: "flex-none text-texte-discret",
  etat: "flex flex-none items-center gap-petit whitespace-nowrap text-petit text-texte-erreur",
  pastille: "size-pastille flex-none rounded-full bg-repere-erreur",
} as const;
