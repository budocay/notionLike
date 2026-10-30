// Clavier du plateau (F-020-AC13, AC15, AC7) : les flèches déplacent le focus d'arrêt en arrêt (carte
// ou commande de pile) et de pile en pile sans rien écrire. Sur une carte, Alt+Maj+Flèche la déplace,
// Entrée ou F2 ouvrent la saisie du titre, la touche de menu ou Maj+F10 ouvrent le menu des actions.
// Un champ, un bouton activé ou un menu garde ses touches : seul l'arrêt lui-même les reçoit.
import type { KeyboardEvent } from "react";

import { type Combinaison, estLaFrappe, TOUCHES_DE_LA_CARTE } from "../../interface/raccourcis.ts";
import type { CommandeDeCarte } from "./destination.ts";
import { arretVoisin, carteDeLArret, type SensDeNavigation } from "./navigation.ts";
import type { EtatDeLaVueKanban } from "./use-vue-kanban.ts";

const COMMANDES: readonly (readonly [Combinaison, CommandeDeCarte])[] = [
  [TOUCHES_DE_LA_CARTE.pilePrecedente, "pile-precedente"],
  [TOUCHES_DE_LA_CARTE.pileSuivante, "pile-suivante"],
  [TOUCHES_DE_LA_CARTE.monter, "monter"],
  [TOUCHES_DE_LA_CARTE.descendre, "descendre"],
];

const DEPLACEMENTS: readonly (readonly [Combinaison, SensDeNavigation])[] = [
  [TOUCHES_DE_LA_CARTE.haut, "haut"],
  [TOUCHES_DE_LA_CARTE.bas, "bas"],
  [TOUCHES_DE_LA_CARTE.gauche, "gauche"],
  [TOUCHES_DE_LA_CARTE.droite, "droite"],
  [TOUCHES_DE_LA_CARTE.debut, "debut"],
  [TOUCHES_DE_LA_CARTE.fin, "fin"],
];

const TITRE = [TOUCHES_DE_LA_CARTE.titre, TOUCHES_DE_LA_CARTE.titreAutrement];
const MENU = [TOUCHES_DE_LA_CARTE.menu, TOUCHES_DE_LA_CARTE.menuAutrement];

function estUneDes(evenement: KeyboardEvent<HTMLElement>, combinaisons: readonly Combinaison[]) {
  return combinaisons.some((combinaison) => estLaFrappe(evenement, combinaison));
}

// Le focus va à l'arrêt voisin ; au bord il reste où il est. Vrai si la touche est une flèche.
function naviguer(
  vue: EtatDeLaVueKanban,
  arret: string,
  evenement: KeyboardEvent<HTMLElement>,
): boolean {
  const sens = DEPLACEMENTS.find(([combinaison]) => estLaFrappe(evenement, combinaison))?.[1];
  if (sens === undefined) {
    return false;
  }
  const vers = arretVoisin(vue.piles, vue.parcours, arret, sens);
  if (vers !== undefined) {
    vue.focus.focaliser(vers);
  }
  return true;
}

function agirSurLaCarte(
  vue: EtatDeLaVueKanban,
  carte: string,
  element: HTMLElement,
  evenement: KeyboardEvent<HTMLElement>,
): boolean {
  const commande = COMMANDES.find(([combinaison]) => estLaFrappe(evenement, combinaison))?.[1];
  if (commande !== undefined) {
    vue.actions.commander(carte, commande);
    return true;
  }
  if (estUneDes(evenement, TITRE)) {
    vue.saisirLeTitre(carte);
    return true;
  }
  if (estUneDes(evenement, MENU)) {
    vue.menu.ouvrir({ sorte: "ligne", ligne: carte }, element, vue.cadre.current);
    return true;
  }
  return false;
}

export function surToucheDuKanban(
  vue: EtatDeLaVueKanban,
  evenement: KeyboardEvent<HTMLElement>,
): void {
  const cible = evenement.target;
  if (!(cible instanceof HTMLElement) || vue.titre.saisie !== undefined) {
    return;
  }
  const arret = cible.dataset["carte"] ?? cible.dataset["arret"];
  if (arret === undefined) {
    return;
  }
  const carte = carteDeLArret(arret);
  const gere =
    naviguer(vue, arret, evenement) ||
    (carte !== undefined && agirSurLaCarte(vue, carte, cible, evenement));
  if (gere) {
    evenement.preventDefault();
  }
}
