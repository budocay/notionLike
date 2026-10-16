// La poignée du bloc où se trouve le curseur (F-006-AC14) : celle de l'éditeur ne suit que le
// pointeur et se masque à chaque frappe ; tant qu'elle ne montre aucun bloc et que le focus est dans
// la zone d'édition, la même poignée est affichée au bloc du curseur, à sa hauteur mesurée. Lire la
// sélection et mesurer n'écrivent rien dans le document. Ce module tient aussi le drapeau du geste
// de la poignée, que le gestionnaire de dépôt lit (F-006-AC15).
import type { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { type RefObject, useEffect, useLayoutEffect, useState } from "react";

import { blocDeLaSelection, debutDuBloc } from "./deplacement-de-bloc.ts";

export interface PoigneeAuCurseur {
  /** Bord haut de la poignée, en pixels depuis celui de la zone d'édition ; absente : non affichée. */
  readonly haut: number | undefined;
  /** La poignée de l'éditeur montre un bloc (vrai) ou s'est masquée (faux). */
  readonly surSurvol: (montree: boolean) => void;
  readonly surDebutDuGeste: () => void;
  readonly surFinDuGeste: () => void;
}

function useRevision(editeur: Editor | null): number {
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (editeur === null) {
      return undefined;
    }
    const relire = (): void => setRevision((avant) => avant + 1);
    editeur.on("transaction", relire);
    return () => void editeur.off("transaction", relire);
  }, [editeur]);
  return revision;
}

function mesurer(editeur: Editor, zone: HTMLElement): number | undefined {
  const indice = blocDeLaSelection(editeur.state);
  if (indice === undefined) {
    return undefined;
  }
  const debut = debutDuBloc(editeur.state.doc, indice);
  const bloc = editeur.view.nodeDOM(debut);
  const haut =
    bloc instanceof HTMLElement
      ? bloc.getBoundingClientRect().top
      : editeur.view.coordsAtPos(debut + 1).top;
  return haut - zone.getBoundingClientRect().top;
}

export function usePoigneeAuCurseur(
  editeur: Editor | null,
  zone: RefObject<HTMLElement | null>,
  /** Focus dans la zone d'édition et poignées rendues : faux, aucune mesure n'est faite. */
  focusDedans: boolean,
  geste: RefObject<boolean>,
): PoigneeAuCurseur {
  const [survolee, setSurvolee] = useState(false);
  const [haut, setHaut] = useState<number | undefined>(undefined);
  const revision = useRevision(editeur);
  const montree = focusDedans && !survolee;
  // Après le rendu, avant l'affichage : la poignée est posée sans passer par l'origine.
  useLayoutEffect(() => {
    const cadre = zone.current;
    const mesure =
      montree && editeur !== null && !editeur.isDestroyed && cadre !== null
        ? mesurer(editeur, cadre)
        : undefined;
    setHaut((avant) => (avant === mesure ? avant : mesure));
  }, [montree, editeur, revision, zone]);
  return {
    haut: montree ? haut : undefined,
    surSurvol: setSurvolee,
    surDebutDuGeste: () => {
      geste.current = true;
    },
    surFinDuGeste: () => {
      geste.current = false;
    },
  };
}

/**
 * Sélectionne tout le bloc de premier niveau du curseur, comme l'activation de sa poignée le fait :
 * la barre de blocs paraît, avec « Monter le bloc » et « Descendre le bloc ». Ne change que la
 * sélection, rien du document ; rend faux si la sélection couvre plusieurs blocs.
 */
export function selectionnerLeBlocDuCurseur(editeur: Editor): boolean {
  const { state } = editeur;
  const indice = blocDeLaSelection(state);
  if (indice === undefined) {
    return false;
  }
  const debut = debutDuBloc(state.doc, indice);
  const fin = debut + state.doc.child(indice).nodeSize;
  const bloc = TextSelection.between(state.doc.resolve(debut + 1), state.doc.resolve(fin - 1));
  editeur.view.dispatch(state.tr.setSelection(bloc));
  return true;
}
