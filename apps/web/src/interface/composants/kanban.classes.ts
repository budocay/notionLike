// Classes de la vue kanban (F-020) : un plateau de piles côte à côte, des cartes qui se glissent, un
// repère de dépôt fait d'un trait ou d'un contour en tirets (jamais la couleur seule, AC21). Aucune
// animation : la carte glissée suit le geste par `transform`, sans transition (F-006-AC29, F-020-AC28).
const CIBLE = "min-h-cible etroit:pointer-fine:min-h-rangee";

export const KANBAN = {
  // Le cadre porte les surfaces flottantes, que la zone défilante des piles ne coupe pas.
  cadre: "relative min-w-nul",
  plateau: "flex min-w-nul items-start gap-moyen overflow-x-auto pb-moyen",
  pile: "rangee flex w-menu flex-none flex-col gap-petit rounded-grand bg-surface-relief p-petit filet",
  pileSurvolee:
    "rangee contour-de-depot flex w-menu flex-none flex-col gap-petit rounded-grand bg-surface-relief p-petit filet",
  enTete: "flex items-center justify-between gap-petit px-petit",
  titreDePile: "extensible truncate text-interface font-fort text-texte-principal",
  nombre: "text-petit text-texte-secondaire",
  cartes: "flex flex-col",
  vide: "px-petit py-mince text-petit text-texte-discret",
  // Une carte : le conteneur reçoit le geste, le contenu reçoit le focus.
  carte: "relative list-none py-infime",
  carteGlissee: "relative plan-menu list-none py-infime",
  contenu: `contour-interieur flex ${CIBLE} items-center justify-between gap-petit rounded-moyen bg-surface-application px-petit text-interface text-texte-principal filet hover:bg-surface-survol`,
  titreDeCarte: "extensible truncate",
  titreVide: "extensible truncate text-texte-discret",
  actions: "flex flex-none items-center",
  depotAvant:
    "pointer-events-none absolute inset-x-nul top-nul h-repere rounded-full bg-repere-focus",
  depotApres:
    "pointer-events-none absolute inset-x-nul bottom-nul h-repere rounded-full bg-repere-focus",
  // Le trait de fin de pile : la carte lâchée sur la pile elle-même est posée après la dernière (AC12).
  depotFin: "pointer-events-none mx-petit h-repere rounded-full bg-repere-focus",
  pied: "flex flex-col items-start gap-mince px-petit",
} as const;
