// Classes du menu d'une rangée : une surface relevée, posée sous son bouton.
export const MENU = {
  cadre:
    "depliage plan-menu absolute right-nul top-full mt-mince flex w-menu max-w-full flex-col rounded-grand bg-surface-relief p-mince shadow-menu filet",
  entree:
    "contour-interieur flex min-h-cible w-full cursor-pointer items-center justify-between gap-normal rounded-moyen px-petit text-left text-interface text-texte-principal hover:bg-surface-active etroit:pointer-fine:min-h-rangee",
} as const;
