// Focus du plateau (F-020-AC15) : un seul arrêt de tabulation, l'arrêt courant (une carte, ou une
// commande de pile quand le plateau n'a aucune carte) ; les flèches déplacent le focus sans rien
// écrire. Une carte déplacée est remontée dans le DOM par sa nouvelle pile : le focus lui est rendu
// après le rendu qui l'a replacée, et sa pile amenée à l'écran.
import { useLayoutEffect, useRef, useState } from "react";

import { type Arret, type Parcours, placeDeLArret, premierArret } from "./navigation.ts";
import type { Pile } from "./piles.ts";

export interface FocusDesCartes {
  /** L'arrêt de tabulation : celui qui a eu le focus, sinon la première carte. */
  readonly courante: Arret | undefined;
  readonly refDe: (arret: Arret) => (element: HTMLElement | null) => void;
  /** Donne le focus à l'arrêt, tout de suite s'il est à l'écran, sinon après le rendu. */
  readonly focaliser: (arret: Arret) => void;
  readonly surFocus: (arret: Arret) => void;
}

function amener(element: HTMLElement): void {
  element.focus();
  // Absent de jsdom : l'écran réel amène la pile, le test n'en a pas besoin.
  if (typeof element.scrollIntoView === "function") {
    element.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
}

export function useFocusDesCartes(piles: readonly Pile[], parcours: Parcours): FocusDesCartes {
  const [choisi, setChoisi] = useState<Arret | undefined>(undefined);
  const elements = useRef(new Map<Arret, HTMLElement>()).current;
  const attendu = useRef<Arret | undefined>(undefined);
  const present = choisi !== undefined && placeDeLArret(piles, parcours, choisi) !== undefined;
  useLayoutEffect(() => {
    const element = attendu.current === undefined ? undefined : elements.get(attendu.current);
    if (element !== undefined) {
      attendu.current = undefined;
      amener(element);
    }
  });
  return {
    courante: present ? choisi : premierArret(piles, parcours),
    refDe: (arret) => (element) => {
      if (element === null) {
        elements.delete(arret);
      } else {
        elements.set(arret, element);
      }
    },
    focaliser: (arret) => {
      attendu.current = arret;
      setChoisi(arret);
    },
    surFocus: setChoisi,
  };
}
