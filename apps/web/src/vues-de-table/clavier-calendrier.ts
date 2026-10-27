// Touches de la grille du calendrier (F-021-AC11, AC20), sans DOM : une frappe sur une case ou sur une
// entrée devient une action, que la vue exécute. Les jours visés se calculent par `jours.ts`.
import { estLaFrappe, TOUCHES_DE_L_ENTREE, TOUCHES_DE_LA_CASE } from "../interface/raccourcis.ts";
import {
  decaler,
  dimancheDeLaSemaine,
  JOURS_PAR_SEMAINE,
  lundiDeLaSemaine,
  memeQuantiemeAilleurs,
} from "./jours.ts";
import type { PasDeJours } from "./commandes-calendrier.ts";

type Frappe = Parameters<typeof estLaFrappe>[0];

export type ActionDeCase =
  /** Porte le focus sur ce jour (`undefined` : hors des bornes, rien ne bouge). */
  | { readonly sorte: "jour"; readonly jour: string | undefined }
  | { readonly sorte: "entrer" }
  | { readonly sorte: "menu" };

export type ActionDEntree =
  | { readonly sorte: "deplacer"; readonly pas: PasDeJours }
  | { readonly sorte: "titre" }
  | { readonly sorte: "case" }
  | { readonly sorte: "menu" };

/** Ce que fait une frappe sur la case de ce jour ; `undefined` si elle n'est pas pour la grille. */
export function actionDeLaCase(frappe: Frappe, jour: string): ActionDeCase | undefined {
  const T = TOUCHES_DE_LA_CASE;
  const vers: readonly (readonly [(typeof T)[keyof typeof T], string | undefined])[] = [
    [T.veille, decaler(jour, -1)],
    [T.lendemain, decaler(jour, 1)],
    [T.semainePrecedente, decaler(jour, -JOURS_PAR_SEMAINE)],
    [T.semaineSuivante, decaler(jour, JOURS_PAR_SEMAINE)],
    [T.lundi, lundiDeLaSemaine(jour)],
    [T.dimanche, dimancheDeLaSemaine(jour)],
    [T.moisPrecedent, memeQuantiemeAilleurs(jour, -1)],
    [T.moisSuivant, memeQuantiemeAilleurs(jour, 1)],
  ];
  const trouve = vers.find(([touche]) => estLaFrappe(frappe, touche));
  if (trouve !== undefined) {
    return { sorte: "jour", jour: trouve[1] };
  }
  if (estLaFrappe(frappe, T.entrer)) {
    return { sorte: "entrer" };
  }
  return estLaFrappe(frappe, T.menu) || estLaFrappe(frappe, T.menuAutrement)
    ? { sorte: "menu" }
    : undefined;
}

/** Ce que fait une frappe sur une entrée qui a le focus, hors saisie de son titre. */
export function actionDeLEntree(frappe: Frappe): ActionDEntree | undefined {
  const T = TOUCHES_DE_L_ENTREE;
  const pas: readonly (readonly [(typeof T)[keyof typeof T], PasDeJours])[] = [
    [T.jourPrecedent, -1],
    [T.jourSuivant, 1],
    [T.semainePrecedente, -JOURS_PAR_SEMAINE],
    [T.semaineSuivante, JOURS_PAR_SEMAINE],
  ];
  const trouve = pas.find(([touche]) => estLaFrappe(frappe, touche));
  if (trouve !== undefined) {
    return { sorte: "deplacer", pas: trouve[1] };
  }
  if (estLaFrappe(frappe, T.modifierLeTitre) || estLaFrappe(frappe, T.modifierLeTitreAutrement)) {
    return { sorte: "titre" };
  }
  if (estLaFrappe(frappe, T.rendreLeFocusALaCase)) {
    return { sorte: "case" };
  }
  return estLaFrappe(frappe, T.menu) || estLaFrappe(frappe, T.menuAutrement)
    ? { sorte: "menu" }
    : undefined;
}
