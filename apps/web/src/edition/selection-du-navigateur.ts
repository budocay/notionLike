// La sélection du navigateur relue par l'éditeur avant un raccourci ou un collage (F-028-AC6, AC30).
// L'éditeur ne relit la sélection du navigateur qu'à l'événement `selectionchange`, que le
// navigateur livre dans une tâche à part : Chromium livre d'abord une frappe, ou un collage, qui
// suit de près une Maj+flèche ou une touche Fin, et l'éditeur l'appliquerait à une sélection
// périmée (Mod+K sans effet, texte collé à la place de l'ancienne sélection).
import { Extension } from "@tiptap/core";
import { Plugin, TextSelection } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";

interface Extremites {
  readonly ancre: number;
  readonly tete: number;
}

/** Les extrémités de la sélection du navigateur, si elle est tout entière dans la zone de saisie. */
function extremitesAffichees(vue: EditorView): Extremites | undefined {
  const affichee = vue.dom.ownerDocument.getSelection();
  if (affichee === null) {
    return undefined;
  }
  const { anchorNode, focusNode } = affichee;
  if (anchorNode === null || focusNode === null) {
    return undefined;
  }
  if (!vue.dom.contains(anchorNode) || !vue.dom.contains(focusNode)) {
    return undefined;
  }
  return {
    ancre: vue.posAtDOM(anchorNode, affichee.anchorOffset),
    tete: vue.posAtDOM(focusNode, affichee.focusOffset),
  };
}

/** Aligne la sélection de l'éditeur sur celle du navigateur, hors composition. */
function relireLaSelectionDuNavigateur(vue: EditorView): void {
  const extremites = vue.composing ? undefined : extremitesAffichees(vue);
  const { state } = vue;
  if (
    extremites === undefined ||
    (state.selection.anchor === extremites.ancre && state.selection.head === extremites.tete)
  ) {
    return;
  }
  const relue = TextSelection.between(
    state.doc.resolve(extremites.ancre),
    state.doc.resolve(extremites.tete),
  );
  vue.dispatch(state.tr.setSelection(relue));
}

/**
 * Relit la sélection du navigateur avant toute frappe avec Mod et avant tout collage, puis laisse
 * l'éditeur et les gestionnaires de la page traiter l'événement : rien n'est retenu ici.
 */
export const selectionDuNavigateur = Extension.create({
  name: "selectionDuNavigateur",
  addProseMirrorPlugins: () => [
    new Plugin({
      props: {
        handleDOMEvents: {
          keydown: (vue, frappe) => {
            if (frappe.ctrlKey || frappe.metaKey) {
              relireLaSelectionDuNavigateur(vue);
            }
            return false;
          },
          paste: (vue) => {
            relireLaSelectionDuNavigateur(vue);
            return false;
          },
        },
      },
    }),
  ],
});
