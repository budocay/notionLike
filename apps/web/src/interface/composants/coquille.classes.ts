// Classes de la coquille : la barre latérale à gauche, le reste (avertissement, barre du haut, zone
// principale) à droite ; seule la zone principale défile avec la page.
export const COQUILLE = {
  cadre: "flex h-dvh w-full overflow-hidden bg-surface-application text-texte-principal",
  barre: "filet-droit flex w-barre flex-none",
  reste: "extensible flex flex-col",
  principale: "extensible overflow-y-auto overflow-x-hidden",
  ecranPlein:
    "flex min-h-dvh items-center justify-center bg-surface-application p-normal text-texte-principal",
} as const;
