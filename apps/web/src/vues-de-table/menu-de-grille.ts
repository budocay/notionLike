// Menu d'un en-tête ou d'une ligne de la grille (F-018-AC20, AC24, AC34) : ouvert depuis la cellule,
// au clavier ou au pointeur, posé au-dessus de la zone défilante sur la cellule qui l'ouvre. Le
// focus va à sa première entrée disponible ; Échap ou un clic au dehors le ferment et rendent le
// focus à la cellule ; le focus qui le quitte le ferme.
import type { IdColonne, IdLigne } from "@notionlike/document";
import { type RefObject, useEffect, useRef, useState } from "react";

import { estLaFrappe, TOUCHES_DE_BOITE } from "../interface/raccourcis.ts";

export type CibleDuMenu =
  | { readonly sorte: "colonne"; readonly colonne: IdColonne }
  | { readonly sorte: "ligne"; readonly ligne: IdLigne };

/** Géométrie de la cellule qui ouvre le menu, relative au cadre de la grille. */
export interface Ancre {
  readonly x: number;
  readonly y: number;
  readonly largeur: number;
  readonly hauteur: number;
}

export interface MenuOuvert {
  readonly cible: CibleDuMenu;
  readonly ancre: Ancre;
}

export interface MenuDeGrille {
  readonly ouvert: MenuOuvert | undefined;
  readonly surface: RefObject<HTMLDivElement | null>;
  /** La cellule qui a ouvert le menu : une boîte ouverte depuis lui lui rend le focus. */
  readonly origine: RefObject<HTMLElement | null>;
  /** Ouvre le menu sur cette cellule, origine du focus rendu. */
  readonly ouvrir: (cible: CibleDuMenu, cellule: HTMLElement, cadre: HTMLElement | null) => void;
  /** Ferme sans toucher au focus : un choix vient d'être fait, il décide de la suite. */
  readonly fermer: () => void;
}

export function ancreDe(cellule: HTMLElement, cadre: HTMLElement | null): Ancre {
  const rectangle = cellule.getBoundingClientRect();
  const origine = cadre?.getBoundingClientRect();
  return {
    x: rectangle.left - (origine?.left ?? 0),
    y: rectangle.top - (origine?.top ?? 0),
    largeur: rectangle.width,
    hauteur: rectangle.height,
  };
}

function ecouterLeDehors(
  surface: RefObject<HTMLElement | null>,
  abandonner: () => void,
  fermer: () => void,
): () => void {
  const dedans = (cible: EventTarget | null): boolean =>
    cible instanceof Node && surface.current?.contains(cible) === true;
  const surClic = (evenement: MouseEvent): void => {
    if (!dedans(evenement.target)) {
      fermer();
    }
  };
  const surTouche = (evenement: KeyboardEvent): void => {
    if (estLaFrappe(evenement, TOUCHES_DE_BOITE.fermer)) {
      evenement.preventDefault();
      evenement.stopPropagation();
      abandonner();
    }
  };
  const surFocus = (evenement: FocusEvent): void => {
    if (!dedans(evenement.target)) {
      fermer();
    }
  };
  document.addEventListener("mousedown", surClic, true);
  document.addEventListener("keydown", surTouche, true);
  document.addEventListener("focusin", surFocus);
  return () => {
    document.removeEventListener("mousedown", surClic, true);
    document.removeEventListener("keydown", surTouche, true);
    document.removeEventListener("focusin", surFocus);
  };
}

export function useMenuDeGrille(): MenuDeGrille {
  const [ouvert, setOuvert] = useState<MenuOuvert | undefined>(undefined);
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
    origine,
    ouvrir: (cible, cellule, cadre) => {
      origine.current = cellule;
      setOuvert({ cible, ancre: ancreDe(cellule, cadre) });
    },
    fermer: () => setOuvert(undefined),
  };
}
