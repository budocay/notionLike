// Champ du mode édition d'une cellule ou d'un en-tête (F-018-AC19, AC27, AC28, AC30, AC32, AC33) :
// Entrée valide et descend, Tab et Maj+Tab valident et passent à côté, la sortie du champ valide,
// Échap abandonne sans rien écrire. Rien n'est écrit à la frappe (H16). Le champ n'est pas un arrêt
// de tabulation : sa cellule, la courante, en est un, et le focus qui y arrive passe au champ (AC33).
import { type KeyboardEvent, type ReactElement, type RefObject, useEffect } from "react";

import { ChampDeCellule } from "../interface/composants/Table.tsx";
import { estLaFrappe, TOUCHES_DE_L_EDITION } from "../interface/raccourcis.ts";
import type { Suite } from "./grille.ts";

const DATE_MIN = "0001-01-01";
const DATE_MAX = "9999-12-31";

interface Proprietes {
  /** Le champ du mode édition de la grille (`EditionDeLaGrille.champ`). */
  readonly champ: RefObject<HTMLInputElement | null>;
  readonly nom: string;
  readonly texte: string;
  readonly date: boolean;
  /** Identifiant du message de refus, quand la dernière validation a été refusée. */
  readonly idFaute: string | undefined;
  readonly changer: (texte: string) => void;
  readonly valider: (suite: Suite) => boolean;
  readonly abandonner: () => void;
  /** Suites d'Entrée et de Tab : un en-tête reste en place. */
  readonly suites: { readonly entree: Suite; readonly tab: Suite; readonly tabArriere: Suite };
}

function suiteDe(evenement: KeyboardEvent<HTMLInputElement>, suites: Proprietes["suites"]) {
  if (estLaFrappe(evenement, TOUCHES_DE_L_EDITION.validerEtDescendre)) {
    return suites.entree;
  }
  if (estLaFrappe(evenement, TOUCHES_DE_L_EDITION.validerEtSuivante)) {
    return suites.tab;
  }
  return estLaFrappe(evenement, TOUCHES_DE_L_EDITION.validerEtPrecedente)
    ? suites.tabArriere
    : undefined;
}

export function ChampDEdition(props: Proprietes): ReactElement {
  const { champ } = props;
  useEffect(() => {
    const element = champ.current;
    element?.focus();
    if (element !== null && !props.date) {
      element.setSelectionRange(element.value.length, element.value.length);
    }
    // Le focus n'est posé qu'à l'entrée en mode édition, pas à chaque frappe.
  }, [champ, props.date]);
  const surTouche = (evenement: KeyboardEvent<HTMLInputElement>): void => {
    // Pendant une composition (IME), Entrée, Tab et Échap appartiennent à la méthode de saisie : la
    // saisie en cours n'est ni validée ni abandonnée.
    if (evenement.nativeEvent.isComposing) {
      return;
    }
    if (estLaFrappe(evenement, TOUCHES_DE_L_EDITION.abandonner)) {
      evenement.preventDefault();
      evenement.stopPropagation();
      props.abandonner();
      return;
    }
    const suite = suiteDe(evenement, props.suites);
    if (suite !== undefined) {
      evenement.preventDefault();
      evenement.stopPropagation();
      props.valider(suite);
    }
  };
  return (
    <ChampDeCellule
      refChamp={champ}
      tabIndex={-1}
      type={props.date ? "date" : "text"}
      min={props.date ? DATE_MIN : undefined}
      max={props.date ? DATE_MAX : undefined}
      nom={props.nom}
      idFaute={props.idFaute}
      value={props.texte}
      onChange={(evenement) => props.changer(evenement.target.value)}
      onKeyDown={surTouche}
      onBlur={() => props.valider("sortie")}
    />
  );
}
