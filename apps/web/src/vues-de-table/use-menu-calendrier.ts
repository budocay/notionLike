// Menu d'une case ou d'une entrée du calendrier (F-021-AC10, AC11, AC21) : ouvert depuis l'élément,
// au clavier (Maj+F10, touche Menu) ou au pointeur, posé sur lui au-dessus de la grille. Le focus va
// à sa première entrée disponible ; Échap ou un clic au dehors le ferment et rendent le focus à
// l'élément. Même mécanique que le menu de la grille de F-018.
import type { IdLigne } from "@notionlike/document";
import { type RefObject, useEffect, useRef, useState } from "react";

import { type Ancre, ancreDe, ecouterLeDehors } from "./menu-de-grille.ts";

export type CibleDuMenuDuCalendrier =
  | { readonly sorte: "case"; readonly jour: string }
  | { readonly sorte: "entree"; readonly ligne: IdLigne; readonly jour: string };

export interface MenuDuCalendrier {
  readonly ouvert: { readonly cible: CibleDuMenuDuCalendrier; readonly ancre: Ancre } | undefined;
  readonly surface: RefObject<HTMLDivElement | null>;
  readonly ouvrir: (
    cible: CibleDuMenuDuCalendrier,
    element: HTMLElement,
    cadre: HTMLElement | null,
  ) => void;
  /** Ferme sans toucher au focus : un choix vient d'être fait, il décide de la suite. */
  readonly fermer: () => void;
}

export function useMenuDuCalendrier(): MenuDuCalendrier {
  const [ouvert, setOuvert] = useState<MenuDuCalendrier["ouvert"]>(undefined);
  const surface = useRef<HTMLDivElement>(null);
  const origine = useRef<HTMLElement | null>(null);
  const estOuvert = ouvert !== undefined;
  useEffect(() => {
    if (!estOuvert) {
      return undefined;
    }
    surface.current?.querySelector<HTMLElement>('[role="menuitem"]:not(:disabled)')?.focus();
    return ecouterLeDehors(
      surface,
      () => {
        setOuvert(undefined);
        origine.current?.focus();
      },
      () => setOuvert(undefined),
    );
  }, [estOuvert]);
  return {
    ouvert,
    surface,
    ouvrir: (cible, element, cadre) => {
      origine.current = element;
      setOuvert({ cible, ancre: ancreDe(element, cadre) });
    },
    fermer: () => setOuvert(undefined),
  };
}
