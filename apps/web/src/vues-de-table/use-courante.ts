// Cellule courante et focus de la grille (F-018-AC33, AC35, AC47) : un seul arrêt de tabulation
// (tabindex itinérant), le focus posé sur l'élément de la cellule une fois rendue, sa rangée amenée
// dans la zone visible. Une ligne ou une colonne disparue fait passer à la voisine la plus proche.
import type { ColonneLue, LigneLue } from "@notionlike/document";
import { type RefObject, useEffect, useLayoutEffect, useRef, useState } from "react";

import {
  cleDeCellule,
  type Courante,
  COURANTE_INITIALE,
  couranteA,
  memeCellule,
  placeDe,
} from "./courante.ts";
import type { Position } from "./navigation-grille.ts";

export interface CouranteDeLaGrille {
  readonly courante: Courante;
  readonly place: Position;
  /** Rend la cellule à cette place courante, l'amène dans la vue et lui donne le focus. */
  readonly allerA: (place: Position) => void;
  /**
   * Rend courante la cellule désignée par ses identifiants, qui peuvent n'apparaître qu'au rendu
   * suivant (ligne ou colonne tout juste créée), et lui donne le focus.
   */
  readonly allerVers: (vers: Courante) => void;
  /** Le focus est arrivé sur la cellule à cette place (clic, retour de focus). */
  readonly devenirCourante: (place: Position) => void;
  readonly refCellule: (cle: string) => (element: HTMLElement | null) => void;
  readonly elementDe: (cle: string) => HTMLElement | undefined;
  /** Donne le focus à la cellule courante au prochain rendu. */
  readonly focaliser: () => void;
}

interface Options {
  readonly lignes: readonly LigneLue[];
  readonly colonnes: readonly ColonneLue[];
  readonly grille: RefObject<HTMLElement | null>;
  readonly amener: (indice: number) => void;
}

function noterLaCellule(
  cellules: Map<string, HTMLElement>,
  cle: string,
  element: HTMLElement | null,
): void {
  if (element === null) {
    cellules.delete(cle);
  } else {
    cellules.set(cle, element);
  }
}

function focusPerduOuDans(grille: HTMLElement | null): boolean {
  const actif = document.activeElement;
  return actif === null || actif === document.body || grille?.contains(actif) === true;
}

// Le focus demandé est posé dès que l'élément de la cellule est rendu. Une boîte de dialogue qui
// se ferme dans le même rendu laisse encore le reste de la page inerte jusqu'à l'effet qui la
// démonte : le focus posé à la mise en page est alors refusé, il est redemandé après cet effet
// (F-038-AC7, colonne ajoutée par une boîte).
function useFocusDiffere(
  cellules: RefObject<Map<string, HTMLElement>>,
  aFocaliser: RefObject<string | undefined>,
): void {
  const poser = (dernierEssai: boolean): void => {
    const cle = aFocaliser.current;
    const element = cle === undefined ? undefined : cellules.current.get(cle);
    if (element?.isConnected !== true) {
      return;
    }
    element.focus();
    if (dernierEssai || document.activeElement === element) {
      aFocaliser.current = undefined;
    }
  };
  useLayoutEffect(() => poser(false));
  useEffect(() => poser(true));
}

export function useCourante({ lignes, colonnes, grille, amener }: Options): CouranteDeLaGrille {
  const [tenue, setTenue] = useState<Courante>(COURANTE_INITIALE);
  const cellules = useRef(new Map<string, HTMLElement>());
  const aFocaliser = useRef<string | undefined>(undefined);
  const place = placeDe(tenue, lignes, colonnes);
  const courante = couranteA(place, lignes, colonnes);
  const disparue = !memeCellule(courante, tenue);
  // Effet sans dépendances : il corrige, après chaque rendu, une cellule tenue que la table lue n'a
  // plus. Il ne boucle pas : l'état ne change que si `disparue` est vrai, et le rendu suivant tient
  // alors la cellule recalculée, pour laquelle `memeCellule` est vrai.
  useEffect(() => {
    if (disparue) {
      if (focusPerduOuDans(grille.current)) {
        aFocaliser.current = cleDeCellule(courante.ligne, courante.colonne);
      }
      setTenue(courante);
    }
  });
  useFocusDiffere(cellules, aFocaliser);
  return {
    courante,
    place,
    allerA: (vers) => {
      const suivante = couranteA(vers, lignes, colonnes);
      aFocaliser.current = cleDeCellule(suivante.ligne, suivante.colonne);
      setTenue(suivante);
      if (vers.rang > 0) {
        amener(vers.rang - 1);
      }
    },
    allerVers: (vers) => {
      aFocaliser.current = cleDeCellule(vers.ligne, vers.colonne);
      setTenue(vers);
      if (vers.place.rang > 0) {
        amener(vers.place.rang - 1);
      }
    },
    devenirCourante: (vers) => setTenue(couranteA(vers, lignes, colonnes)),
    refCellule: (cle) => (element) => noterLaCellule(cellules.current, cle, element),
    elementDe: (cle) => cellules.current.get(cle),
    focaliser: () => {
      aFocaliser.current = cleDeCellule(courante.ligne, courante.colonne);
    },
  };
}
