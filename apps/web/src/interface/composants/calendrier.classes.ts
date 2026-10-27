// Classes de la vue calendrier (F-021) : grille du mois en rangées de semaine, cases, entrées, panneau
// « Sans date ». Aucune animation : la vue n'en déclare pas (F-021-AC31). Tout vient des jetons de
// F-004 ; une case hors du mois et celle d'aujourd'hui se marquent aussi par le texte et le
// soulignement, jamais par la couleur seule (F-021-AC1, AC4).
const CIBLE_DANS_UNE_CASE =
  "contour-interieur cursor-pointer rounded-petit px-mince text-petit text-texte-secondaire hover:bg-surface-survol disabled:cursor-default";
const CASE =
  "contour-interieur extensible flex min-h-immense flex-col gap-mince p-mince filet-droit";

export const CALENDRIER = {
  cadre: "relative flex min-w-nul flex-col gap-moyen",
  titre: "text-intertitre font-fort text-texte-principal",
  grille: "flex flex-col rounded-grand bg-surface-relief filet",
  enTetes: "flex filet-bas text-petit font-fort text-texte-secondaire",
  enTete: "extensible px-petit py-mince truncate",
  semaine: "flex filet-bas",
  case: `${CASE} bg-surface-relief`,
  caseHorsDuMois: `${CASE} bg-surface-retrait`,
  caseAujourdhui: `${CASE} bg-surface-active`,
  enteteDeCase: "flex items-center justify-between gap-mince",
  numero: "text-petit text-texte-secondaire",
  numeroHorsDuMois: "text-petit text-texte-discret",
  numeroAujourdhui: "text-petit font-fort text-texte-principal underline",
  entrees: "flex flex-col gap-infime",
  entree:
    "contour-interieur flex items-center gap-mince rounded-petit bg-surface-active px-mince text-petit text-texte-principal",
  libelle: "extensible truncate",
  commande: CIBLE_DANS_UNE_CASE,
  panneau: "flex flex-col gap-petit rounded-grand bg-surface-relief p-normal filet",
  panneauTitre: "text-courant font-fort text-texte-principal",
  panneauVide: "text-interface text-texte-secondaire",
  lignes: "flex flex-col gap-mince",
  ligne:
    "contour-interieur flex flex-wrap items-center justify-between gap-petit rounded-moyen px-petit py-mince text-interface text-texte-principal",
  ligneLibelle: "extensible truncate",
  ligneCommandes: "flex flex-wrap items-center gap-mince",
} as const;
