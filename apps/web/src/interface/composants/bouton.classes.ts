// Classes des boutons. Cible de 44 pixels sous le seuil étroit, compacte au-dessus.
const BASE =
  "inline-flex min-h-cible cursor-pointer items-center justify-center gap-petit whitespace-nowrap rounded-moyen px-moyen text-interface font-moyen etroit:min-h-rangee";

export const BOUTON = {
  principal: `${BASE} bg-texte-principal text-surface-retrait hover:bg-texte-secondaire`,
  discret: `${BASE} bg-surface-relief text-texte-principal shadow-relief filet hover:bg-surface-survol`,
} as const;

const ICONE =
  "inline-flex size-cible flex-none cursor-pointer items-center justify-center rounded-petit text-texte-discret hover:text-texte-principal etroit:size-bouton-icone";

export const BOUTON_ICONE = {
  barre: `${ICONE} hover:bg-surface-survol`,
  rangee: `${ICONE} hover:bg-surface-application`,
} as const;
