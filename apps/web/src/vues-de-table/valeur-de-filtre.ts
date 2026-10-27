// Valeur saisie pour un filtre (F-019-AC1, AC24, AC25), sans DOM : le texte du champ devient la valeur
// du filtre, `undefined` quand il est vide (le filtre est alors inactif), ou un message de refus qui
// laisse la définition inchangée. Mêmes formes et mêmes messages que la saisie d'une cellule du même
// type (F-018-AC27, AC28, AC30).
import type { ColonneLue } from "@notionlike/document";

import { nombreAffiche } from "./affichage.ts";
import { estUneDateDuCalendrier } from "./date-du-calendrier.ts";
import { LIMITE_DE_VALEUR, type ValeurDeFiltre } from "./definition.ts";
import { analyserNombre } from "./saisie.ts";
import { DATE_INVALIDE, NOMBRE_INVALIDE, VALEUR_DE_FILTRE_TROP_LONGUE } from "./textes.ts";

export type AnalyseDeFiltre =
  | { readonly sorte: "valeur"; readonly valeur: ValeurDeFiltre | undefined }
  | { readonly sorte: "refus"; readonly message: string };

function refus(message: string): AnalyseDeFiltre {
  return { sorte: "refus", message };
}

function analyserUnNombre(saisi: string): AnalyseDeFiltre {
  const analyse = analyserNombre(saisi);
  if (analyse.sorte === "refus") {
    return refus(NOMBRE_INVALIDE);
  }
  return { sorte: "valeur", valeur: analyse.valeur === null ? undefined : Number(analyse.valeur) };
}

function analyserUneDate(saisi: string): AnalyseDeFiltre {
  if (saisi !== "" && !estUneDateDuCalendrier(saisi)) {
    return refus(DATE_INVALIDE);
  }
  return { sorte: "valeur", valeur: saisi === "" ? undefined : saisi };
}

export function analyserLaValeur(colonne: ColonneLue, saisi: string): AnalyseDeFiltre {
  if (saisi.length > LIMITE_DE_VALEUR) {
    return refus(VALEUR_DE_FILTRE_TROP_LONGUE);
  }
  switch (colonne.type) {
    case "nombre":
      return analyserUnNombre(saisi);
    case "date":
      return analyserUneDate(saisi);
    case "case":
      return { sorte: "valeur", valeur: undefined };
    case "texte":
    case "selection":
      return { sorte: "valeur", valeur: saisi === "" ? undefined : saisi };
  }
}

/** Le texte proposé dans le champ pour la valeur enregistrée d'un filtre. */
export function texteDeLaValeur(valeur: ValeurDeFiltre | undefined): string {
  if (valeur === undefined) {
    return "";
  }
  return typeof valeur === "number" ? nombreAffiche(valeur) : valeur;
}
