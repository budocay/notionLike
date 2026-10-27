// Touches de la vue calendrier (F-021-AC11, AC20, H5), chacune sous le nom de son action, dans la
// forme que déclare `interface/raccourcis.ts` (F-004-AC31). Une entrée n'est pas une zone de texte :
// Alt+Maj+Flèche ne s'y confond avec aucune saisie (convention de F-006 H5 et de F-018-AC24).
import type { Combinaison } from "../interface/raccourcis.ts";

/** Entrée du calendrier qui a le focus, hors saisie de son titre. */
export const TOUCHES_DE_L_ENTREE = {
  jourPrecedent: { touche: "ArrowLeft", modificateurs: ["Alt", "Maj"] },
  jourSuivant: { touche: "ArrowRight", modificateurs: ["Alt", "Maj"] },
  semainePrecedente: { touche: "ArrowUp", modificateurs: ["Alt", "Maj"] },
  semaineSuivante: { touche: "ArrowDown", modificateurs: ["Alt", "Maj"] },
  modifierLeTitre: { touche: "Enter", modificateurs: [] },
  modifierLeTitreAutrement: { touche: "F2", modificateurs: [] },
  rendreLeFocusALaCase: { touche: "Escape", modificateurs: [] },
  menu: { touche: "F10", modificateurs: ["Maj"] },
  menuAutrement: { touche: "ContextMenu", modificateurs: [] },
} as const satisfies Readonly<Record<string, Combinaison>>;

/** Case du calendrier qui a le focus (AC20). */
export const TOUCHES_DE_LA_CASE = {
  veille: { touche: "ArrowLeft", modificateurs: [] },
  lendemain: { touche: "ArrowRight", modificateurs: [] },
  semainePrecedente: { touche: "ArrowUp", modificateurs: [] },
  semaineSuivante: { touche: "ArrowDown", modificateurs: [] },
  lundi: { touche: "Home", modificateurs: [] },
  dimanche: { touche: "End", modificateurs: [] },
  moisPrecedent: { touche: "PageUp", modificateurs: [] },
  moisSuivant: { touche: "PageDown", modificateurs: [] },
  entrer: { touche: "Enter", modificateurs: [] },
  menu: { touche: "F10", modificateurs: ["Maj"] },
  menuAutrement: { touche: "ContextMenu", modificateurs: [] },
} as const satisfies Readonly<Record<string, Combinaison>>;
