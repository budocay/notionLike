// Focus des cartes du kanban (F-020-AC15) : un seul arrêt de tabulation, la carte courante ; les
// flèches déplacent le focus sans rien écrire. Une carte déplacée est remontée dans le DOM par sa
// nouvelle pile : le focus lui est rendu après le rendu qui l'a replacée, et sa pile amenée à l'écran.
import type { IdLigne } from "@notionlike/document";
import { useLayoutEffect, useRef, useState } from "react";

import { placeDeLaCarte } from "./destination.ts";
import { type Limites, premiereCarte } from "./navigation.ts";
import type { Pile } from "./piles.ts";

export interface FocusDesCartes {
  /** La carte qui est l'arrêt de tabulation : celle qui a eu le focus, sinon la première. */
  readonly courante: IdLigne | undefined;
  readonly refDe: (carte: IdLigne) => (element: HTMLElement | null) => void;
  /** Donne le focus à la carte, tout de suite si elle est à l'écran, sinon après le rendu. */
  readonly focaliser: (carte: IdLigne) => void;
  readonly surFocus: (carte: IdLigne) => void;
}

function amener(element: HTMLElement): void {
  element.focus();
  // Absent de jsdom : l'écran réel amène la pile, le test n'en a pas besoin.
  if (typeof element.scrollIntoView === "function") {
    element.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
}

export function useFocusDesCartes(piles: readonly Pile[], limite: Limites): FocusDesCartes {
  const [choisie, setChoisie] = useState<IdLigne | undefined>(undefined);
  const elements = useRef(new Map<IdLigne, HTMLElement>()).current;
  const attendue = useRef<IdLigne | undefined>(undefined);
  const presente = choisie !== undefined && placeDeLaCarte(piles, choisie) !== undefined;
  useLayoutEffect(() => {
    const element = attendue.current === undefined ? undefined : elements.get(attendue.current);
    if (element !== undefined) {
      attendue.current = undefined;
      amener(element);
    }
  });
  return {
    courante: presente ? choisie : premiereCarte(piles, limite),
    refDe: (carte) => (element) => {
      if (element === null) {
        elements.delete(carte);
      } else {
        elements.set(carte, element);
      }
    },
    focaliser: (carte) => {
      attendue.current = carte;
      setChoisie(carte);
    },
    surFocus: setChoisie,
  };
}
