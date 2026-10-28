// Les quatre déplacements d'une entrée par pas de jours (F-021-AC11) : le pas, le nom de la commande
// et la combinaison qui la déclenche au clavier. Partagés par l'entrée et par son menu.
import { TOUCHES_DE_L_ENTREE } from "../interface/raccourcis.ts";
import type { PasDeJours } from "./dates-visees.ts";
import { JOURS_PAR_SEMAINE } from "./jours.ts";
import {
  JOUR_PRECEDENT,
  JOUR_SUIVANT,
  SEMAINE_PRECEDENTE,
  SEMAINE_SUIVANTE,
} from "./textes-calendrier.ts";

export const PAS: readonly {
  readonly pas: PasDeJours;
  readonly libelle: string;
  readonly touche: keyof typeof TOUCHES_DE_L_ENTREE;
}[] = [
  { pas: -1, libelle: JOUR_PRECEDENT, touche: "jourPrecedent" },
  { pas: 1, libelle: JOUR_SUIVANT, touche: "jourSuivant" },
  { pas: -JOURS_PAR_SEMAINE, libelle: SEMAINE_PRECEDENTE, touche: "semainePrecedente" },
  { pas: JOURS_PAR_SEMAINE, libelle: SEMAINE_SUIVANTE, touche: "semaineSuivante" },
];
