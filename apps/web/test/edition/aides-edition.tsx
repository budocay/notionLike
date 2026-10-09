// Aides des tests du module d'édition : l'éditeur est piloté par ses commandes, ses règles de
// saisie et des événements clavier, faute de frappe réelle sous jsdom (F-003 H12).
import { type DocumentPage, ouvrirDocumentPage } from "@notionlike/document";
import { act, cleanup, render } from "@testing-library/react";
import { Editor } from "@tiptap/core";
import { StrictMode } from "react";
import { afterEach, vi } from "vitest";
import * as Y from "yjs";

import { extensionsDeLEditeur } from "../../src/edition/extensions.ts";
import { EditeurDePage } from "../../src/edition/index.ts";

afterEach(() => {
  cleanup();
});

export interface Montage {
  readonly doc: Y.Doc;
  readonly page: DocumentPage;
  /** Mises à jour émises par le document depuis le montage, avec leur origine. */
  readonly misesAJour: Uint8Array[];
}

/** Monte l'éditeur comme l'application le fait, sous `StrictMode`, sur un document donné. */
export function monterEditeur(doc: Y.Doc = new Y.Doc()): Montage {
  const page = ouvrirDocumentPage(doc);
  const misesAJour: Uint8Array[] = [];
  doc.on("update", (miseAJour: Uint8Array) => misesAJour.push(miseAJour));
  render(
    <StrictMode>
      <EditeurDePage contenu={page.contenu} garderVersion={page.garderVersion} />
    </StrictMode>,
  );
  return { doc, page, misesAJour };
}

export function zoneDeSaisie(): HTMLElement | null {
  return document.querySelector<HTMLElement>(".ProseMirror");
}

export function editeurMonte(): Editor {
  const editeur = (zoneDeSaisie() as (HTMLElement & { editor?: Editor }) | null)?.editor;
  if (editeur === undefined) {
    throw new Error("Aucun éditeur monté.");
  }
  return editeur;
}

/** Joue chaque caractère par les règles de saisie, puis par l'insertion ordinaire. */
export function taper(texte: string): void {
  const { view } = editeurMonte();
  act(() => {
    for (const caractere of texte) {
      const { from, to } = view.state.selection;
      const inserer = () => view.state.tr.insertText(caractere, from, to);
      const traite = view.someProp("handleTextInput", (regle) =>
        regle(view, from, to, caractere, inserer),
      );
      if (traite !== true) {
        view.dispatch(inserer());
      }
    }
  });
}

interface Modificateurs {
  readonly shiftKey?: boolean;
  readonly ctrlKey?: boolean;
}

/** Envoie une touche à la zone de saisie ; rend vrai si l'éditeur l'a traitée. */
export function presser(key: string, modificateurs: Modificateurs = {}): boolean {
  const evenement = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    ...modificateurs,
  });
  act(() => void editeurMonte().view.dom.dispatchEvent(evenement));
  return evenement.defaultPrevented;
}

export function annuler(): boolean {
  return presser("z", { ctrlKey: true });
}

export function retablir(): boolean {
  return presser("z", { ctrlKey: true, shiftKey: true });
}

/** Contenu lu : la suite des blocs du fragment (type, niveau, texte, imbrication). */
export function contenuLu(source: Y.Doc | DocumentPage): string {
  const page = source instanceof Y.Doc ? ouvrirDocumentPage(source) : source;
  return page.contenu.toString();
}

/** Mise à jour produite par une autre réplique, partie de l'état courant du document. */
export function miseAJourDUneAutreReplique(
  doc: Y.Doc,
  modifier: (replique: Y.Doc) => void,
): Uint8Array {
  const replique = new Y.Doc();
  Y.applyUpdate(replique, Y.encodeStateAsUpdate(doc));
  const etatAvant = Y.encodeStateVector(replique);
  modifier(replique);
  return Y.encodeStateAsUpdate(replique, etatAvant);
}

export function recevoir(doc: Y.Doc, modifier: (replique: Y.Doc) => void): void {
  const miseAJour = miseAJourDUneAutreReplique(doc, modifier);
  act(() => Y.applyUpdate(doc, miseAJour));
}

/** Ajoute un paragraphe à la fin du contenu d'une réplique, comme une autre application le ferait. */
export function ajouterParagraphe(replique: Y.Doc, texte: string): void {
  const paragraphe = new Y.XmlElement("paragraph");
  paragraphe.insert(0, [new Y.XmlText(texte)]);
  const { contenu } = ouvrirDocumentPage(replique);
  contenu.insert(contenu.length, [paragraphe]);
}

const APPELS_RESEAU = ["fetch", "XMLHttpRequest", "WebSocket", "EventSource"] as const;

/** F-003-AC21 : tout appel réseau pendant le test le fait échouer ; rend la liste des appels. */
export function piegerLeReseau(): string[] {
  const appels: string[] = [];
  for (const nom of APPELS_RESEAU) {
    vi.stubGlobal(nom, function piege(): never {
      appels.push(nom);
      throw new Error(`F-003-AC21 : ${nom} appelé par le module d'édition.`);
    });
  }
  return appels;
}

/** Un éditeur sans écran sur un document : la seconde réplique des tests de convergence. */
export function creerEditeurNu(doc: Y.Doc): Editor {
  const editeur = new Editor({ extensions: extensionsDeLEditeur(ouvrirDocumentPage(doc).contenu) });
  editeursNus.push(editeur);
  return editeur;
}

const editeursNus: Editor[] = [];
afterEach(() => {
  editeursNus.splice(0).forEach((editeur) => editeur.destroy());
});

/** Place le curseur à la fin du premier bloc de texte qui porte exactement ce texte. */
export function placerLeCurseurApres(editeur: Editor, texte: string): void {
  let position = -1;
  editeur.state.doc.descendants((noeud, debut) => {
    if (position < 0 && noeud.isText && noeud.text === texte) {
      position = debut + texte.length;
    }
  });
  if (position < 0) {
    throw new Error(`Aucun bloc ne porte le texte « ${texte} ».`);
  }
  act(() => void editeur.commands.setTextSelection(position));
}

/** Colle un contenu riche, comme le presse-papiers le livre. jsdom n'a pas `ClipboardEvent`. */
export function collerHtml(html: string): void {
  const { view } = editeurMonte();
  act(() => void view.pasteHTML(html, new Event("paste") as ClipboardEvent));
}

export function collerTexte(texte: string): void {
  const { view } = editeurMonte();
  act(() => void view.pasteText(texte, new Event("paste") as ClipboardEvent));
}
