// Déplacement d'un bloc (F-006-AC16 à AC20, ADR-0015) : la seule opération par laquelle passent le
// lâcher de la poignée et les commandes au clavier. Un bloc est un enfant de premier niveau du
// document : une liste se déplace d'un seul tenant (F-006-AC19). Yjs ne déplace pas un nœud : le
// bloc est retiré puis réinséré dans une seule transaction de l'éditeur, deux pas de remplacement,
// donc une seule mise à jour Yjs ; aucun identifiant, aucune version élevée (F-006-AC31).
import type { Editor } from "@tiptap/core";
import type { Node as NoeudProseMirror } from "@tiptap/pm/model";
import { type EditorState, Selection, TextSelection, type Transaction } from "@tiptap/pm/state";

export type SensDuDeplacement = "monter" | "descendre";

/** Position, dans le document, du début du bloc de premier niveau d'indice `indice`. */
export function debutDuBloc(document: NoeudProseMirror, indice: number): number {
  let position = 0;
  for (let rang = 0; rang < indice && rang < document.childCount; rang += 1) {
    position += document.child(rang).nodeSize;
  }
  return position;
}

// Clé du greffon d'annulation de la liaison Yjs (`new PluginKey("y-undo")`) : l'état d'un greffon
// est rangé dans l'état de l'éditeur sous sa clé.
const CLE_DE_L_ANNULATION = "y-undo$";

interface GestionnaireDAnnulation {
  stopCapturing(): void;
}

function gestionnaireDAnnulation(etat: EditorState): GestionnaireDAnnulation | undefined {
  const greffon: unknown = Reflect.get(etat, CLE_DE_L_ANNULATION);
  if (typeof greffon !== "object" || greffon === null || !("undoManager" in greffon)) {
    return undefined;
  }
  const gestionnaire = greffon.undoManager;
  return typeof gestionnaire === "object" &&
    gestionnaire !== null &&
    "stopCapturing" in gestionnaire &&
    typeof gestionnaire.stopCapturing === "function"
    ? (gestionnaire as GestionnaireDAnnulation)
    : undefined;
}

/**
 * La sélection après le déplacement : celle qui était dans le bloc le suit, au même endroit de son
 * texte (F-006-AC18) ; une autre est seulement reportée par les pas de la transaction.
 */
function selectionApres(transaction: Transaction, avant: EditorState, ecart: number): void {
  const { selection } = avant;
  if (selection instanceof TextSelection) {
    const { anchor, head } = selection;
    transaction.setSelection(TextSelection.create(transaction.doc, anchor + ecart, head + ecart));
  }
}

/**
 * Déplace le bloc d'indice `de` pour qu'il soit à l'indice `vers` parmi les blocs de premier niveau.
 * Rend faux, sans rien émettre, si la place ne change pas ou si l'un des indices est hors du
 * document (F-006-AC17).
 */
export function deplacerLeBloc(editeur: Editor, de: number, vers: number): boolean {
  const { state } = editeur;
  const { doc } = state;
  const hors = (indice: number): boolean => indice < 0 || indice >= doc.childCount;
  if (de === vers || hors(de) || hors(vers) || !editeur.isEditable) {
    return false;
  }
  const bloc = doc.child(de);
  const debut = debutDuBloc(doc, de);
  const fin = debut + bloc.nodeSize;
  const { from, to } = state.selection;
  const dansLeBloc = from >= debut && to <= fin;
  const transaction = state.tr.delete(debut, fin);
  const arrivee = debutDuBloc(transaction.doc, vers);
  transaction.insert(arrivee, bloc);
  if (dansLeBloc) {
    selectionApres(transaction, state, arrivee - debut);
  } else if (!(state.selection instanceof TextSelection)) {
    transaction.setSelection(Selection.near(transaction.doc.resolve(arrivee + 1)));
  }
  // L'annulation ne défait que le déplacement : ni la saisie d'avant, ni celle d'après (F-006-AC20).
  gestionnaireDAnnulation(state)?.stopCapturing();
  editeur.view.dispatch(transaction);
  gestionnaireDAnnulation(editeur.state)?.stopCapturing();
  return true;
}

/** Indice du bloc qui contient toute la sélection ; `undefined` si elle en couvre plusieurs. */
export function blocDeLaSelection(etat: EditorState): number | undefined {
  const { $from, $to } = etat.selection;
  if ($from.depth === 0 || $to.depth === 0) {
    return undefined;
  }
  const indice = $from.index(0);
  return indice === $to.index(0) ? indice : undefined;
}

/** Où irait le bloc du curseur ; `undefined` : la commande est indisponible (F-006-AC18). */
export function destinationDuBlocCourant(
  etat: EditorState,
  sens: SensDuDeplacement,
): { readonly de: number; readonly vers: number } | undefined {
  const de = blocDeLaSelection(etat);
  if (de === undefined) {
    return undefined;
  }
  const vers = sens === "monter" ? de - 1 : de + 1;
  return vers < 0 || vers >= etat.doc.childCount ? undefined : { de, vers };
}

/** Déplace d'une place le bloc du curseur ; faux si la commande est indisponible. */
export function deplacerLeBlocCourant(editeur: Editor, sens: SensDuDeplacement): boolean {
  const destination = destinationDuBlocCourant(editeur.state, sens);
  return destination !== undefined && deplacerLeBloc(editeur, destination.de, destination.vers);
}
