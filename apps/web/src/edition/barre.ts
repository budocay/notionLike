// État de la barre de blocs flottante (F-003-AC41) : affichée tant que le focus est dans la zone
// d'édition et que la sélection n'est pas vide, ou que le curseur est dans un bloc vide (tant que le
// menu slash de F-005 n'est pas livré). Lire cet état n'écrit rien dans le document.
import type { Editor } from "@tiptap/core";
import { type FocusEvent, type RefObject, useEffect, useLayoutEffect, useState } from "react";

import { type Placement, placerLaBarre } from "./placement.ts";
import { type TypeDeBloc, typeDuBlocCourant } from "./types-de-bloc.ts";

interface Lecture {
  /** Vrai si la sélection appelle la barre : étendue, ou curseur dans un bloc vide. */
  readonly appelee: boolean;
  readonly courant: TypeDeBloc | undefined;
  /** Change à chaque transaction : la position se recalcule. */
  readonly revision: number;
}

export interface Barre {
  readonly affichee: boolean;
  readonly courant: TypeDeBloc | undefined;
  readonly placement: Placement;
  readonly surFocus: () => void;
  readonly surPerteDeFocus: (evenement: FocusEvent<HTMLElement>) => void;
}

interface Reperes {
  readonly zone: RefObject<HTMLElement | null>;
  readonly barre: RefObject<HTMLElement | null>;
}

const SANS_LECTURE: Lecture = { appelee: false, courant: undefined, revision: 0 };
const A_L_ORIGINE: Placement = { gauche: 0, haut: 0 };
const DEFILEMENTS = ["auto", "scroll"];

function lire(editeur: Editor, revision: number): Lecture {
  const { empty, $from } = editeur.state.selection;
  const dansUnBlocVide = $from.parent.isTextblock && $from.parent.content.size === 0;
  return { appelee: !empty || dansUnBlocVide, courant: typeDuBlocCourant(editeur), revision };
}

function useLecture(editeur: Editor | null): Lecture {
  const [lecture, setLecture] = useState(SANS_LECTURE);
  useEffect(() => {
    if (editeur === null) {
      setLecture(SANS_LECTURE);
      return undefined;
    }
    const relire = (): void => setLecture((avant) => lire(editeur, avant.revision + 1));
    relire();
    editeur.on("transaction", relire);
    return () => void editeur.off("transaction", relire);
  }, [editeur]);
  return lecture;
}

// Bord haut de l'ancêtre qui fait défiler la page : ce qui est au-dessus n'est pas visible.
function hautVisible(element: HTMLElement): number {
  for (let parent = element.parentElement; parent !== null; parent = parent.parentElement) {
    if (DEFILEMENTS.includes(getComputedStyle(parent).overflowY)) {
      return Math.max(0, parent.getBoundingClientRect().top);
    }
  }
  return 0;
}

function mesurer(editeur: Editor, zone: HTMLElement, barre: HTMLElement): Placement {
  const { from, to } = editeur.state.selection;
  const debut = editeur.view.coordsAtPos(from);
  const fin = editeur.view.coordsAtPos(to);
  const cadreDeLaZone = zone.getBoundingClientRect();
  return placerLaBarre({
    selection: {
      gauche: Math.min(debut.left, fin.left),
      haut: Math.min(debut.top, fin.top),
      bas: Math.max(debut.bottom, fin.bottom),
    },
    zone: { gauche: cadreDeLaZone.left, haut: cadreDeLaZone.top },
    barre: { largeur: barre.offsetWidth, hauteur: barre.offsetHeight },
    fenetre: {
      largeur: document.documentElement.clientWidth,
      hauteur: document.documentElement.clientHeight,
    },
    hautVisible: hautVisible(zone),
  });
}

export function useBarre(editeur: Editor | null, reperes: Reperes): Barre {
  const lecture = useLecture(editeur);
  const [focusDedans, setFocusDedans] = useState(false);
  const [placement, setPlacement] = useState(A_L_ORIGINE);
  const affichee = editeur !== null && focusDedans && lecture.appelee;
  const { revision } = lecture;

  // Après le rendu, avant l'affichage : la barre est mesurée puis posée, sans passer par l'origine.
  useLayoutEffect(() => {
    const [zone, barre] = [reperes.zone.current, reperes.barre.current];
    if (!affichee || editeur === null || editeur.isDestroyed || zone === null || barre === null) {
      return;
    }
    const mesure = mesurer(editeur, zone, barre);
    setPlacement((avant) =>
      avant.gauche === mesure.gauche && avant.haut === mesure.haut ? avant : mesure,
    );
  }, [affichee, editeur, revision, reperes.zone, reperes.barre]);

  return {
    affichee,
    courant: lecture.courant,
    placement,
    surFocus: () => setFocusDedans(true),
    // Le focus qui passe de la zone de saisie à la barre reste dans la zone d'édition.
    surPerteDeFocus: (evenement) => {
      if (!evenement.currentTarget.contains(evenement.relatedTarget)) {
        setFocusDedans(false);
      }
    },
  };
}
