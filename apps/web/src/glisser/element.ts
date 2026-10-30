// Un élément de la liste glissable : ce que la rangée pose sur son DOM pour être saisie, survolée et
// déplacée. Seuls des types de React, du DOM et des chaînes en sortent (F-006-AC32).
import { useDroppable } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { type DOMAttributes, useContext } from "react";

import { ContexteDuSurvol } from "./survol.ts";
import type { ZoneDeDepot } from "./zone.ts";

export interface ElementGlissable {
  /** À poser sur l'élément déplacé et survolé : la rangée. */
  readonly ref: (element: HTMLElement | null) => void;
  /** À poser sur la rangée : le pointeur la saisit n'importe où. */
  readonly ecouteursDuPointeur: Pick<DOMAttributes<HTMLElement>, "onPointerDown">;
  /** À poser sur le seul élément qui reçoit la touche de saisie : le lien de la rangée. */
  readonly ecouteursDuClavier: Pick<DOMAttributes<HTMLElement>, "onKeyDown">;
  /** Identifiant du texte d'instructions, à joindre à la description de cet élément. */
  readonly idDesInstructions: string;
  /** Valeur de `transform` pendant le geste, jamais de transition (F-006-AC29). */
  readonly deplacement: string | undefined;
  readonly enGlissement: boolean;
  /** Zone où dessiner le repère de dépôt, si cet élément est la cible survolée et admise. */
  readonly zone: ZoneDeDepot | undefined;
}

// Aucune animation de la bibliothèque après un changement d'ordre (F-006-AC29, H8).
const SANS_ANIMATION = (): boolean => false;

type Ecouteur<T> = T | undefined;

export function useElementGlissable(id: string): ElementGlissable {
  const { setNodeRef, listeners, attributes, transform, isDragging } = useSortable({
    id,
    animateLayoutChanges: SANS_ANIMATION,
    transition: null,
  });
  const survol = useContext(ContexteDuSurvol);
  return {
    ref: setNodeRef,
    ecouteursDuPointeur: {
      onPointerDown: listeners?.onPointerDown as Ecouteur<
        DOMAttributes<HTMLElement>["onPointerDown"]
      >,
    },
    ecouteursDuClavier: {
      onKeyDown: listeners?.onKeyDown as Ecouteur<DOMAttributes<HTMLElement>["onKeyDown"]>,
    },
    idDesInstructions: attributes["aria-describedby"],
    deplacement: transform === null ? undefined : CSS.Translate.toString(transform),
    enGlissement: isDragging,
    zone: survol !== undefined && survol.cible === id ? survol.zone : undefined,
  };
}

/** Ce qu'une pile pose sur son DOM pour recevoir un dépôt, même sans carte (F-020-AC12, AC25). */
export interface ZoneDePile {
  readonly ref: (element: HTMLElement | null) => void;
  /** Vrai quand la pile elle-même est la cible survolée : en tête ou en fin de pile, ou pile vide. */
  readonly survolee: boolean;
}

export function useZoneDePile(id: string): ZoneDePile {
  const { setNodeRef } = useDroppable({ id, data: { pile: true } });
  const survol = useContext(ContexteDuSurvol);
  return { ref: setNodeRef, survolee: survol !== undefined && survol.cible === id };
}
