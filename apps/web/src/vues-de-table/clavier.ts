// Clavier de la grille hors mode édition (F-018-AC24, AC29, AC33) : déplacements de la cellule
// courante, mode édition, case, vidage, déplacement de ligne, menus d'en-tête et de ligne. Le mode
// édition lit ses propres touches dans son champ. Tab n'est pas lu : il quitte la grille, qui ne
// compte que pour un arrêt de tabulation.
import type { KeyboardEvent } from "react";

import {
  caractereSeul,
  estLaFrappe,
  RACCOURCIS,
  TOUCHES_DE_LA_CELLULE,
} from "../interface/raccourcis.ts";
import { basculerUneCase, deplacerUneLigne, viderUneCellule } from "./actions.ts";
import { cleDeCellule } from "./courante.ts";
import { deplacementDeLaFrappe, deplacer, estUneDesFrappes } from "./navigation-grille.ts";
import type { VueTableau } from "./use-vue-tableau.ts";

const EDITER = [TOUCHES_DE_LA_CELLULE.editer, TOUCHES_DE_LA_CELLULE.editerAutrement];
const VIDER = [TOUCHES_DE_LA_CELLULE.vider, TOUCHES_DE_LA_CELLULE.viderAutrement];

/** Ouvre le menu de la cellule courante, si elle est un en-tête ou la cellule d'actions d'une ligne. */
export function ouvrirLeMenuCourant(vue: VueTableau): boolean {
  const { courante, place } = vue.courante;
  const element = vue.courante.elementDe(cleDeCellule(courante.ligne, courante.colonne));
  if (element === undefined) {
    return false;
  }
  if (place.rang === 0 && courante.colonne !== null) {
    vue.menu.ouvrir({ sorte: "colonne", colonne: courante.colonne }, element, vue.cadre.current);
    return true;
  }
  if (place.rang > 0 && place.colonne === 0 && courante.ligne !== null) {
    vue.menu.ouvrir({ sorte: "ligne", ligne: courante.ligne }, element, vue.cadre.current);
    return true;
  }
  return false;
}

function deplacerLaLigne(vue: VueTableau, evenement: KeyboardEvent<HTMLElement>): boolean {
  const sens = estLaFrappe(evenement, RACCOURCIS.monterLaLigne)
    ? -1
    : estLaFrappe(evenement, RACCOURCIS.descendreLaLigne)
      ? 1
      : 0;
  const { courante } = vue.courante;
  if (sens === 0 || courante.ligne === null) {
    return false;
  }
  deplacerUneLigne(vue.moyens, courante.ligne, sens, courante);
  return true;
}

// Les touches d'une cellule de donnée : mode édition, case, vidage, caractère frappé.
function toucheDeDonnee(vue: VueTableau, evenement: KeyboardEvent<HTMLElement>): boolean {
  const { place } = vue.courante;
  const ligne = vue.proprietes.lignes[place.rang - 1];
  const colonne = vue.colonnes[place.colonne - 1];
  if (ligne === undefined || colonne === undefined) {
    return false;
  }
  if (estLaFrappe(evenement, TOUCHES_DE_LA_CELLULE.basculer) && colonne.type === "case") {
    basculerUneCase(vue.moyens, ligne, place.colonne - 1);
    return true;
  }
  if (estUneDesFrappes(evenement, VIDER)) {
    viderUneCellule(vue.moyens, ligne, place.colonne - 1);
    return true;
  }
  if (estUneDesFrappes(evenement, EDITER)) {
    vue.edition.commencer(place);
    return true;
  }
  const caractere = caractereSeul(evenement);
  if (caractere !== undefined && (colonne.type === "texte" || colonne.type === "nombre")) {
    vue.edition.commencer(place, caractere);
    return true;
  }
  return false;
}

function toucheDeLaCellule(vue: VueTableau, evenement: KeyboardEvent<HTMLElement>): boolean {
  const deplacement = deplacementDeLaFrappe(evenement);
  if (deplacement !== undefined) {
    const { lignes } = vue.proprietes;
    const dimensions = {
      lignes: lignes.length,
      colonnes: vue.colonnes.length,
      parPage: vue.fenetre.parPage,
    };
    vue.courante.allerA(deplacer(vue.courante.place, deplacement, dimensions));
    return true;
  }
  if (deplacerLaLigne(vue, evenement)) {
    return true;
  }
  const ouvre = estUneDesFrappes(evenement, [...EDITER, TOUCHES_DE_LA_CELLULE.basculer]);
  if (ouvre && ouvrirLeMenuCourant(vue)) {
    return true;
  }
  return vue.courante.place.rang > 0 && toucheDeDonnee(vue, evenement);
}

/** Frappe dans la grille : seules les cellules la lisent, hors mode édition. */
export function surToucheDeLaGrille(vue: VueTableau, evenement: KeyboardEvent<HTMLElement>): void {
  const cible = evenement.target;
  const surUneCellule =
    cible instanceof HTMLElement &&
    /^(gridcell|columnheader|rowheader)$/.test(cible.getAttribute("role") ?? "");
  if (vue.edition.edition !== undefined || !surUneCellule) {
    return;
  }
  if (toucheDeLaCellule(vue, evenement)) {
    evenement.preventDefault();
  }
}
