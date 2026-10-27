// Où va le focus quand la cible suivie n'est pas dans le DOM (F-021-AC13, AC22). Une entrée cachée
// par la limite de trois par case déplie sa case ; une ligne du panneau au-delà de la limite l'élargit ;
// une ligne passée dans le panneau y reçoit le focus ; une entrée disparue, ou partie hors de la
// grille, le rend à la case qu'elle occupait, sans changer le mois affiché.
import type { LigneLue } from "@notionlike/document";

import type { ModeleDuCalendrier } from "./modele-calendrier.ts";
import type { NavigationDuCalendrier } from "./use-navigation-du-calendrier.ts";
import type { CibleDeFocus, Repli } from "./use-suivi-du-focus.ts";

function repliDeLaLigne(
  cible: Extract<CibleDeFocus, { sorte: "entree" | "panneau" }>,
  ligne: LigneLue,
  modele: ModeleDuCalendrier,
  navigation: NavigationDuCalendrier,
): Repli {
  const jour = modele.jourDansLaGrille(ligne.id);
  if (jour !== undefined) {
    if (navigation.depliees.has(jour)) {
      return undefined;
    }
    navigation.deplier(jour);
    return "attendre";
  }
  const rang = modele.repartition.sansDate.findIndex(({ id }) => id === ligne.id);
  if (rang < 0) {
    return cible.sorte === "entree" ? { sorte: "case", jour: cible.jour } : undefined;
  }
  if (rang >= navigation.limiteDuPanneau) {
    navigation.elargirLePanneauJusqua(rang);
    return "attendre";
  }
  return { sorte: "panneau", ligne: ligne.id };
}

export function repliDeLaCible(
  cible: CibleDeFocus,
  modele: ModeleDuCalendrier,
  navigation: NavigationDuCalendrier,
): Repli {
  if (cible.sorte === "case") {
    return undefined;
  }
  const ligne = modele.ligneDe(cible.ligne);
  if (ligne === undefined) {
    return cible.sorte === "entree" ? { sorte: "case", jour: cible.jour } : undefined;
  }
  return repliDeLaLigne(cible, ligne, modele, navigation);
}
