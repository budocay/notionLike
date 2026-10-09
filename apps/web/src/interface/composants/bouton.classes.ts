// Classes des boutons à pictogramme. Cible de 44 pixels sous le seuil étroit, compacte au-dessus
// pour un pointeur fin.
const ICONE =
  "inline-flex size-cible flex-none cursor-pointer items-center justify-center rounded-petit text-texte-discret hover:text-texte-principal etroit:pointer-fine:size-bouton-icone";

export const BOUTON_ICONE = {
  barre: `${ICONE} hover:bg-surface-survol`,
  rangee: `${ICONE} hover:bg-surface-application`,
} as const;
