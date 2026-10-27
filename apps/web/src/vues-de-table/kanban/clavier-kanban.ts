// Clavier de la carte qui a le focus (F-020-AC13, AC15, AC7) : les flèches déplacent le focus de
// carte en carte et de pile en pile sans rien écrire, Alt+Maj+Flèche déplace la carte, Entrée ou F2
// ouvrent la saisie du titre, la touche de menu ou Maj+F10 ouvrent le menu des actions. Seule la
// carte reçoit ces touches : un champ, un bouton ou un menu garde les siennes.
import type { KeyboardEvent } from "react";

import {
  type Combinaison,
  estLaFrappe,
  TOUCHES_DE_LA_CARTE,
  TOUCHES_DE_LA_CELLULE,
  TOUCHES_DE_LA_GRILLE,
} from "../../interface/raccourcis.ts";
import { estUneDesFrappes } from "../navigation-grille.ts";
import type { CommandeDeCarte } from "./destination.ts";
import { carteVoisine, type SensDeNavigation } from "./navigation.ts";
import type { VueKanban } from "./use-vue-kanban.ts";

const COMMANDES: readonly (readonly [Combinaison, CommandeDeCarte])[] = [
  [TOUCHES_DE_LA_CARTE.pilePrecedente, "pile-precedente"],
  [TOUCHES_DE_LA_CARTE.pileSuivante, "pile-suivante"],
  [TOUCHES_DE_LA_CARTE.monter, "monter"],
  [TOUCHES_DE_LA_CARTE.descendre, "descendre"],
];

const DEPLACEMENTS: readonly (readonly [Combinaison, SensDeNavigation])[] = [
  [TOUCHES_DE_LA_GRILLE.haut, "haut"],
  [TOUCHES_DE_LA_GRILLE.bas, "bas"],
  [TOUCHES_DE_LA_GRILLE.gauche, "gauche"],
  [TOUCHES_DE_LA_GRILLE.droite, "droite"],
  [TOUCHES_DE_LA_GRILLE.debutDeLigne, "debut"],
  [TOUCHES_DE_LA_GRILLE.finDeLigne, "fin"],
];

const TITRE = [TOUCHES_DE_LA_CELLULE.editer, TOUCHES_DE_LA_CELLULE.editerAutrement];
const MENU = [TOUCHES_DE_LA_CARTE.menu, TOUCHES_DE_LA_CARTE.menuAutrement];

function agirSurLaCarte(
  vue: VueKanban,
  carte: string,
  element: HTMLElement,
  evenement: KeyboardEvent<HTMLElement>,
): boolean {
  const commande = COMMANDES.find(([combinaison]) => estLaFrappe(evenement, combinaison))?.[1];
  if (commande !== undefined) {
    vue.actions.commander(carte, commande);
    return true;
  }
  const sens = DEPLACEMENTS.find(([combinaison]) => estLaFrappe(evenement, combinaison))?.[1];
  if (sens !== undefined) {
    const vers = carteVoisine(vue.piles, vue.limites.limiteDe, carte, sens);
    if (vers !== undefined) {
      vue.focus.focaliser(vers);
    }
    return true;
  }
  if (estUneDesFrappes(evenement, TITRE)) {
    vue.saisirLeTitre(carte);
    return true;
  }
  if (estUneDesFrappes(evenement, MENU)) {
    vue.menu.ouvrir({ sorte: "ligne", ligne: carte }, element, vue.cadre.current);
    return true;
  }
  return false;
}

export function surToucheDuKanban(vue: VueKanban, evenement: KeyboardEvent<HTMLElement>): void {
  const cible = evenement.target;
  const carte = cible instanceof HTMLElement ? cible.dataset["carte"] : undefined;
  if (!(cible instanceof HTMLElement) || carte === undefined || vue.titre.saisie !== undefined) {
    return;
  }
  if (agirSurLaCarte(vue, carte, cible, evenement)) {
    evenement.preventDefault();
  }
}
