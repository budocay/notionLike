// Touches d'une boîte de dialogue de l'écran de table (F-018-AC18, AC21, AC22, AC25) : Échap la
// ferme, Tab et Maj+Tab bouclent sur ses éléments, comme les boîtes des écrans des espaces.
import type { KeyboardEvent } from "react";

import { estLaFrappe, TOUCHES_DE_BOITE } from "../interface/raccourcis.ts";

const FOCALISABLES = "button:not(:disabled), input:not(:disabled), select:not(:disabled)";

export function touchesDeBoite(
  fermer: () => void,
): (evenement: KeyboardEvent<HTMLElement>) => void {
  return (evenement) => {
    if (estLaFrappe(evenement, TOUCHES_DE_BOITE.fermer)) {
      evenement.preventDefault();
      evenement.stopPropagation();
      fermer();
      return;
    }
    const arriere = estLaFrappe(evenement, TOUCHES_DE_BOITE.precedent);
    if (!arriere && !estLaFrappe(evenement, TOUCHES_DE_BOITE.suivant)) {
      return;
    }
    const elements = [...evenement.currentTarget.querySelectorAll<HTMLElement>(FOCALISABLES)];
    const actif = elements.findIndex((element) => element === document.activeElement);
    const depart = actif === -1 ? (arriere ? 0 : -1) : actif;
    const suivant = elements[(depart + (arriere ? -1 : 1) + elements.length) % elements.length];
    if (suivant !== undefined) {
      evenement.preventDefault();
      suivant.focus();
    }
  };
}
