// Ce que l'éditeur fait d'un lâcher et des raccourcis de déplacement d'un bloc (F-006-AC15, AC18,
// AC21, AC35). Le gestionnaire de dépôt est appelé avant le traitement par défaut :
//   1. un fichier survolé ou lâché, seul ou avec autre chose, est refusé : rien n'est inscrit, et
//      l'action par défaut du navigateur, qui ouvrirait le fichier, est empêchée (F-006-AC35). Le
//      refus passe par `handleDOMEvents`, que ProseMirror appelle aussi en lecture seule, où il ne
//      transmet plus survols ni lâchers à ses gestionnaires d'édition (F-013-AC25) ;
//   2. le geste de la poignée est ramené à l'opération unique du déplacement d'un bloc (F-006-AC16),
//      vers la place que le curseur de dépôt montrait ;
//   3. tout autre lâcher (contenu venu d'ailleurs, texte glissé dans la page) suit le chemin du
//      collage, sous ses règles (F-006-AC21).
import { type Editor, Extension } from "@tiptap/core";
import type { Node as NoeudProseMirror, Slice } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { dropPoint } from "@tiptap/pm/transform";
import type { EditorView } from "@tiptap/pm/view";

import {
  debutDuBloc,
  deplacerLeBloc,
  deplacerLeBlocCourant,
  type SensDuDeplacement,
} from "./deplacement-de-bloc.ts";

export interface OptionsDuDepot {
  /** Le sens du raccourci de déplacement que la frappe désigne ; `undefined` pour toute autre. */
  readonly deplacementDuBloc: (frappe: KeyboardEvent) => SensDuDeplacement | undefined;
  /** Vrai entre le début et la fin d'un geste de la poignée de bloc. */
  readonly gesteDeLaPoignee: () => boolean;
}

/** Indice de l'intervalle entre deux blocs de premier niveau le plus proche de la position. */
function intervalleDe(document: NoeudProseMirror, position: number): number {
  const resolue = document.resolve(position);
  if (resolue.depth === 0) {
    return resolue.index(0);
  }
  const indice = resolue.index(0);
  const debut = debutDuBloc(document, indice);
  const milieu = debut + document.child(indice).nodeSize / 2;
  return position < milieu ? indice : indice + 1;
}

/** Pendant le survol, le navigateur ne livre que les types : « Files » y dit qu'un fichier vient. */
function contientUnFichier(evenement: DragEvent): boolean {
  const transfert = evenement.dataTransfer;
  if (transfert === null) {
    return false;
  }
  return transfert.files.length > 0 || Array.from(transfert.types).includes("Files");
}

/** Empêche l'action par défaut d'un geste qui porte un fichier ; rend vrai s'il en porte un. */
function refuserLeFichier(_vue: EditorView, evenement: DragEvent): boolean {
  if (!contientUnFichier(evenement)) {
    return false;
  }
  evenement.preventDefault();
  return true;
}

/** Le lâcher d'un bloc par sa poignée : de sa place à celle que le curseur de dépôt montrait. */
function lacherLeBloc(vue: EditorView, evenement: DragEvent, tranche: Slice, editeur: Editor) {
  const de = blocSelectionneParLaPoignee(vue);
  const point = vue.posAtCoords({ left: evenement.clientX, top: evenement.clientY });
  if (de === undefined || point === null) {
    return;
  }
  const arrivee = dropPoint(vue.state.doc, point.pos, tranche) ?? point.pos;
  const intervalle = intervalleDe(vue.state.doc, arrivee);
  deplacerLeBloc(editeur, de, intervalle > de ? intervalle - 1 : intervalle);
}

/**
 * La poignée sélectionne les blocs qu'elle glisse, d'un intervalle à l'autre du premier niveau. Un
 * seul bloc est déplacé ; plusieurs : le geste est abandonné, rien n'est modifié (hors périmètre).
 */
function blocSelectionneParLaPoignee(vue: EditorView): number | undefined {
  const { $from, $to } = vue.state.selection;
  if ($from.depth !== 0 || $to.depth !== 0) {
    return undefined;
  }
  return $to.index(0) - $from.index(0) === 1 ? $from.index(0) : undefined;
}

export function depotDeLEditeur(options: OptionsDuDepot): Extension {
  return Extension.create({
    name: "depotDeLEditeur",
    addProseMirrorPlugins() {
      const { editor } = this;
      return [
        new Plugin({
          key: new PluginKey("depotDeLEditeur"),
          props: {
            handleDOMEvents: {
              dragenter: refuserLeFichier,
              dragover: refuserLeFichier,
              drop: refuserLeFichier,
            },
            handleDrop: (vue, evenement, tranche) => {
              if (!options.gesteDeLaPoignee()) {
                return false;
              }
              lacherLeBloc(vue, evenement, tranche, editor);
              return true;
            },
            // Les deux combinaisons sont prises dans l'éditeur, commande disponible ou non : sous
            // macOS, le navigateur y étendrait la sélection par paragraphe (F-006-AC18, H5).
            handleKeyDown: (_vue, frappe) => {
              const sens = options.deplacementDuBloc(frappe);
              if (sens === undefined) {
                return false;
              }
              deplacerLeBlocCourant(editor, sens);
              return true;
            },
          },
        }),
      ];
    },
  });
}
