// Aides des tests de l'éditeur : seul fichier de test qui nomme un type de la bibliothèque
// d'édition (F-003-AC27). L'éditeur est piloté par ses commandes, ses règles de saisie et des
// événements clavier, faute de frappe réelle sous jsdom (F-003 H12) ; la frappe réelle est prouvée
// par le bout en bout (F-003-AC28).
import { act, screen } from "@testing-library/react";
import type { Editor } from "@tiptap/core";

export const NOM_DE_L_EDITEUR = "Contenu de la page";
export const NOMS_DES_COMMANDES = [
  "Paragraphe",
  "Titre 1",
  "Titre 2",
  "Titre 3",
  "Liste à puces",
  "Liste numérotée",
] as const;
export type NomDeCommande = (typeof NOMS_DES_COMMANDES)[number];

export function zoneDeSaisie(): HTMLElement {
  return screen.getByRole("textbox", { name: NOM_DE_L_EDITEUR });
}

export function chercherLaZoneDeSaisie(): HTMLElement | null {
  return screen.queryByRole("textbox", { name: NOM_DE_L_EDITEUR });
}

export function attendreLaZoneDeSaisie(): Promise<HTMLElement> {
  return screen.findByRole("textbox", { name: NOM_DE_L_EDITEUR });
}

// La bibliothèque attache son éditeur à l'élément de la zone de saisie.
function editeurMonte(): Editor {
  const editeur = (zoneDeSaisie() as HTMLElement & { editor?: Editor }).editor;
  if (editeur === undefined) {
    throw new Error("Aucun éditeur n'est attaché à la zone de saisie.");
  }
  return editeur;
}

/** Donne le focus à la zone de saisie, comme un clic ou une tabulation. */
export function entrerDansLEditeur(): void {
  act(() => zoneDeSaisie().focus());
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
  readonly altKey?: boolean;
}

/** Envoie une touche à l'élément qui a le focus ; rend vrai si elle a été traitée. */
export function presser(key: string, modificateurs: Modificateurs = {}): boolean {
  const cible = document.activeElement ?? document.body;
  const evenement = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    ...modificateurs,
  });
  act(() => void cible.dispatchEvent(evenement));
  return evenement.defaultPrevented;
}

export function annuler(): boolean {
  return presser("z", { ctrlKey: true });
}

export function retablir(): boolean {
  return presser("z", { ctrlKey: true, shiftKey: true });
}

/** Place le curseur à la fin du premier bloc de texte qui porte exactement ce texte. */
export function placerLeCurseurApres(texte: string): void {
  const editeur = editeurMonte();
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

/** Étend la sélection à tout le contenu. */
export function toutSelectionner(): void {
  const editeur = editeurMonte();
  act(() => void editeur.commands.selectAll());
}

/** Colle un contenu riche, comme le presse-papiers le livre. jsdom n'a pas `ClipboardEvent`. */
export function collerDuHtml(html: string): void {
  const { view } = editeurMonte();
  act(() => void view.pasteHTML(html, new Event("paste") as ClipboardEvent));
}

export function collerDuTexte(texte: string): void {
  const { view } = editeurMonte();
  act(() => void view.pasteText(texte, new Event("paste") as ClipboardEvent));
}

/** Vrai si un éditeur vivant est attaché à cet élément. */
export function porteUnEditeurVivant(element: Element): boolean {
  const editeur = (element as Element & { editor?: Editor }).editor;
  return editeur !== undefined && !editeur.isDestroyed;
}

export interface SchemaLu {
  readonly noeuds: Readonly<Record<string, readonly string[]>>;
  readonly marques: readonly string[];
}

/** Nœuds, attributs de chaque nœud et marques du schéma de l'éditeur monté, triés. */
export function schemaDeLEditeur(): SchemaLu {
  const { schema } = editeurMonte();
  const noeuds = Object.fromEntries(
    Object.entries(schema.nodes)
      .map(([nom, type]): [string, string[]] => [nom, Object.keys(type.spec.attrs ?? {}).sort()])
      .sort(([a], [b]) => a.localeCompare(b)),
  );
  return { noeuds, marques: Object.keys(schema.marks).sort() };
}

export function barreDeBlocs(): HTMLElement | null {
  return screen.queryByRole("toolbar", { name: "Type de bloc" });
}

export function commande(nom: NomDeCommande): HTMLElement {
  return screen.getByRole("button", { name: nom });
}
