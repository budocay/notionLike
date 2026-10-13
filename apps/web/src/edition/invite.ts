// Invite du bloc vide (F-003-AC40) : une décoration de la vue, jamais un nœud du document. Elle
// n'émet donc aucune mise à jour et n'entre pas dans le contenu lu.
import { Extension } from "@tiptap/core";
import type { Node as NoeudProseMirror } from "@tiptap/pm/model";
import { type EditorState, Plugin } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

const ATTRIBUT_DE_L_INVITE = "data-invite";
const PARAGRAPHE = "paragraph";

interface BlocVide {
  readonly debut: number;
  readonly noeud: NoeudProseMirror;
}

// Le bloc qui porte l'invite : le seul bloc d'un document vide, sinon le paragraphe vide où se
// trouve le curseur. `undefined` : aucune invite.
function blocAInviter(etat: EditorState): BlocVide | undefined {
  const { doc, selection } = etat;
  const premier = doc.firstChild;
  if (doc.childCount === 1 && premier !== null && estUnParagrapheVide(premier)) {
    return { debut: 0, noeud: premier };
  }
  const { $from, empty } = selection;
  if (!empty || !estUnParagrapheVide($from.parent)) {
    return undefined;
  }
  return { debut: $from.before(), noeud: $from.parent };
}

function estUnParagrapheVide(noeud: NoeudProseMirror): boolean {
  return noeud.type.name === PARAGRAPHE && noeud.content.size === 0;
}

export function inviteDuBlocVide(texte: string): Extension {
  return Extension.create({
    name: "inviteDuBlocVide",
    addProseMirrorPlugins: () => [
      new Plugin({
        props: {
          decorations: (etat) => {
            const bloc = blocAInviter(etat);
            if (bloc === undefined) {
              return DecorationSet.empty;
            }
            const decoration = Decoration.node(bloc.debut, bloc.debut + bloc.noeud.nodeSize, {
              [ATTRIBUT_DE_L_INVITE]: texte,
            });
            return DecorationSet.create(etat.doc, [decoration]);
          },
        },
      }),
    ],
  });
}
