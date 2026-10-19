// Menu slash, côté interface (F-005-AC12, AC22, AC34) : la position que la bibliothèque donne au
// menu ouvert, et la désignation de la liste et de la commande active par l'éditeur. L'extension et
// ses touches sont dans `menu-slash.ts`.
import type { Editor } from "@tiptap/core";
import { type RefObject, useEffect, useId, useLayoutEffect, useRef, useState } from "react";

import type { PositionDuMenu } from "../interface/composants/Edition.tsx";
import type { EtatDuMenu } from "./menu-slash.ts";

/** Ce que la zone d'édition lit du menu pour le rendre. */
export interface MenuAffiche {
  readonly etat: EtatDuMenu | undefined;
  /** `undefined` tant que la bibliothèque de positionnement ne l'a pas mesuré. */
  readonly position: PositionDuMenu | undefined;
  readonly ref: RefObject<HTMLDivElement | null>;
  readonly idDeLaListe: string;
  readonly idDeLOption: (rang: number) => string;
}

/**
 * Pose le menu ouvert près du curseur, une fois par ouverture : la bibliothèque le suit ensuite
 * (défilement, redimensionnement) et ne fait que donner ses coordonnées, que l'interface pose.
 */
function usePosition(
  etat: EtatDuMenu | undefined,
  ref: RefObject<HTMLDivElement | null>,
): PositionDuMenu | undefined {
  const [position, setPosition] = useState<PositionDuMenu | undefined>(undefined);
  const dernier = useRef(etat);
  useLayoutEffect(() => {
    dernier.current = etat;
  });
  const ouvert = etat !== undefined;
  useLayoutEffect(() => {
    const [element, courant] = [ref.current, dernier.current];
    if (!ouvert || element === null || courant === undefined) {
      setPosition(undefined);
      return undefined;
    }
    return courant.monter(element, setPosition);
  }, [ouvert, ref]);
  return position;
}

/**
 * Tant que le menu est ouvert, l'éditeur garde le focus et désigne la liste et la commande active
 * (`aria-controls`, `aria-activedescendant`), retirées à la fermeture (F-005-AC22, H12).
 */
function useDesignation(
  editeur: Editor | null,
  etat: EtatDuMenu | undefined,
  idDeLaListe: string,
): void {
  const active =
    etat === undefined || etat.commandes.length === 0 ? undefined : `${idDeLaListe}-${etat.active}`;
  const ouvert = etat !== undefined;
  useEffect(() => {
    if (editeur === null || editeur.isDestroyed) {
      return undefined;
    }
    const element = editeur.view.dom;
    const poser = (nom: string, valeur: string | undefined): void => {
      if (valeur === undefined) {
        element.removeAttribute(nom);
      } else {
        element.setAttribute(nom, valeur);
      }
    };
    poser("aria-controls", ouvert ? idDeLaListe : undefined);
    poser("aria-activedescendant", active);
    return () => {
      poser("aria-controls", undefined);
      poser("aria-activedescendant", undefined);
    };
  }, [editeur, ouvert, active, idDeLaListe]);
}

export function useMenuAffiche(editeur: Editor | null, etat: EtatDuMenu | undefined): MenuAffiche {
  const ref = useRef<HTMLDivElement>(null);
  const idDeLaListe = useId();
  const position = usePosition(etat, ref);
  useDesignation(editeur, etat, idDeLaListe);
  return {
    etat,
    position,
    ref,
    idDeLaListe,
    idDeLOption: (rang) => `${idDeLaListe}-${rang}`,
  };
}
