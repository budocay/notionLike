// Classes de la coquille : la barre latérale à gauche, le reste (avertissement, barre du haut, zone
// principale) à droite ; seule la zone principale défile avec la page. Sous le seuil étroit, la
// barre n'est pas affichée au repos ; ouverte, elle est un tiroir posé par-dessus le reste, que
// couvre un voile. Le cadre et l'écran plein remplissent ce qui les contient : `fenetre` et
// `ecranPlein` leur donnent la hauteur de la fenêtre dans l'application, `ecranApercu` celle de son
// contenu dans un aperçu.
export const COQUILLE = {
  fenetre: "h-dvh w-full",
  cadre: "flex h-full w-full overflow-hidden bg-surface-application text-texte-principal",
  barre: "filet-droit hidden w-barre flex-none etroit:flex",
  tiroir:
    "tiroir largeur-tiroir plan-tiroir filet-droit fixed inset-y-nul left-nul flex shadow-menu",
  voile: "voile plan-voile fixed inset-nul shadow-voile",
  reste: "extensible flex flex-col",
  principale: "extensible contour-interieur overflow-y-auto overflow-x-hidden",
  ecranPlein:
    "flex min-h-dvh items-center justify-center bg-surface-application p-normal text-texte-principal",
  ecranApercu:
    "flex items-center justify-center bg-surface-application p-normal text-texte-principal",
} as const;
