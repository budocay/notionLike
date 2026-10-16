// Aides des tests de l'éditeur : seul fichier de test qui nomme un type de la bibliothèque
// d'édition (F-003-AC27). L'éditeur est piloté par ses commandes, ses règles de saisie et des
// événements clavier, faute de frappe réelle sous jsdom (F-003 H12) ; la frappe réelle est prouvée
// par le bout en bout (F-003-AC28).
import type { DocumentPage } from "@notionlike/document";
import { act, cleanup, render, screen } from "@testing-library/react";
import type { Editor } from "@tiptap/core";
import { StrictMode } from "react";
import { afterEach, vi } from "vitest";
import * as Y from "yjs";

import { EditeurDePage } from "../../src/edition/index.ts";
import { estUnClicAvecMod } from "../../src/interface/clic.ts";
import { estLaFrappe, RACCOURCIS } from "../../src/interface/raccourcis.ts";
import { eleverPour } from "../../src/page/session-page.ts";
import {
  miseAJourDUneReplique,
  ouvrirFacadeDePage,
  suivreLeDocument,
} from "../aides-facade-page.ts";

const arretsDEcoute: (() => void)[] = [];

// L'éditeur est démonté, puis les écoutes des tests retirées, avant que l'aide des façades ne
// compte les observateurs restés sur chaque document.
afterEach(() => {
  cleanup();
  arretsDEcoute.splice(0).forEach((arreter) => arreter());
});

/** Mises à jour émises par le document à partir de maintenant ; l'écoute cesse en fin de test. */
export function ecouterLesMisesAJour(doc: Y.Doc): Uint8Array[] {
  suivreLeDocument(doc);
  const emises: Uint8Array[] = [];
  const noter = (miseAJour: Uint8Array): void => void emises.push(miseAJour);
  doc.on("update", noter);
  arretsDEcoute.push(() => doc.off("update", noter));
  return emises;
}

export interface Montage {
  readonly doc: Y.Doc;
  readonly page: DocumentPage;
  /** Mises à jour émises par le document depuis avant le montage. */
  readonly emises: Uint8Array[];
}

/** Monte l'éditeur seul, comme l'application le fait : sous `StrictMode`, sur une façade de page. */
export function monterLEditeur(doc: Y.Doc = new Y.Doc()): Montage {
  const emises = ecouterLesMisesAJour(doc);
  const page = ouvrirFacadeDePage(doc);
  render(
    <StrictMode>
      <EditeurDePage
        contenu={page.contenu}
        garderVersion={page.garderVersion}
        preparerLaVersion={(elements) => eleverPour(page, elements)}
        meneALaBarre={(frappe) => estLaFrappe(frappe, RACCOURCIS.barreDeBlocs)}
        ouvreLePanneauDeLien={(frappe) => estLaFrappe(frappe, RACCOURCIS.lien)}
        ouvreLAdresse={estUnClicAvecMod}
      />
    </StrictMode>,
  );
  return { doc, page, emises };
}

/** Démonte l'éditeur monté, qui détruit sa liaison ; le document reste. */
export function demonterLEditeur(): void {
  cleanup();
}

const APPELS_RESEAU = ["fetch", "XMLHttpRequest", "WebSocket", "EventSource"] as const;

/**
 * Coupe le réseau (F-003-AC21) : tout appel de l'une des quatre interfaces lève, donc fait échouer
 * l'action qui l'émet, et son nom est noté dans la liste rendue.
 */
export function couperLeReseau(): string[] {
  const appels: string[] = [];
  for (const nom of APPELS_RESEAU) {
    vi.stubGlobal(nom, function interfaceCoupee(): never {
      appels.push(nom);
      throw new Error(`F-003-AC21 : ${nom} appelé pendant l'édition.`);
    });
  }
  return appels;
}

/** Le document reçoit ce qu'une autre réplique a modifié, comme la synchronisation le livrera. */
export function recevoirDUneReplique(doc: Y.Doc, modifier: (replique: DocumentPage) => void): void {
  const miseAJour = miseAJourDUneReplique(doc, modifier);
  act(() => Y.applyUpdate(doc, miseAJour));
}

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
/** Les commandes de mise en forme, après celles des types de bloc (F-028-AC4). */
export const NOMS_DES_COMMANDES_DE_MARQUE = ["Gras", "Italique", "Lien"] as const;
export type NomDeCommandeDeMarque = (typeof NOMS_DES_COMMANDES_DE_MARQUE)[number];

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

/** Étend la sélection à tout le texte du bloc où se trouve le curseur. */
export function selectionnerLeBloc(): void {
  const editeur = editeurMonte();
  const { $from } = editeur.state.selection;
  act(() => void editeur.commands.setTextSelection({ from: $from.start(), to: $from.end() }));
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

export function commande(nom: NomDeCommande | NomDeCommandeDeMarque): HTMLElement {
  return screen.getByRole("button", { name: nom });
}

// ——— Mise en forme dans le texte (F-028) ———

/** Mod+touche, envoyée à l'élément qui a le focus : sous jsdom, Mod vaut Ctrl (F-028 H9). */
export function presserAvecMod(touche: string, modificateurs: Modificateurs = {}): boolean {
  return presser(touche, { ...modificateurs, ctrlKey: true });
}

/** Position, dans le document de l'éditeur, du début de ce texte dans le premier bloc qui le porte. */
function positionDuTexte(texte: string): number {
  const editeur = editeurMonte();
  let position = -1;
  editeur.state.doc.descendants((noeud, debut) => {
    const rang = noeud.isTextblock ? noeud.textContent.indexOf(texte) : -1;
    if (position < 0 && rang >= 0) {
      position = debut + 1 + rang;
    }
    return position < 0;
  });
  if (position < 0) {
    throw new Error(`Aucun bloc ne porte le texte « ${texte} ».`);
  }
  return position;
}

/** Sélectionne ce texte, là où il paraît pour la première fois. */
export function selectionnerLeTexte(texte: string): void {
  const editeur = editeurMonte();
  const debut = positionDuTexte(texte);
  act(() => void editeur.commands.setTextSelection({ from: debut, to: debut + texte.length }));
}

/**
 * Sélectionne ce texte dans la sélection du navigateur seulement, comme Maj+flèche : l'éditeur ne la
 * relira qu'à l'événement `selectionchange`, que le navigateur livre plus tard, dans une autre tâche.
 */
export function selectionnerDansLeNavigateur(texte: string): void {
  const { noeud, rang } = texteAffiche(texte);
  window.getSelection()?.setBaseAndExtent(noeud, rang, noeud, rang + texte.length);
}

/** Pose le curseur après ce texte dans la sélection du navigateur seulement, comme la touche Fin. */
export function placerDansLeNavigateurApres(texte: string): void {
  const { noeud, rang } = texteAffiche(texte);
  window.getSelection()?.collapse(noeud, rang + texte.length);
}

function texteAffiche(texte: string): { readonly noeud: Node; readonly rang: number } {
  const parcours = document.createTreeWalker(zoneDeSaisie(), NodeFilter.SHOW_TEXT);
  for (let noeud = parcours.nextNode(); noeud !== null; noeud = parcours.nextNode()) {
    const rang = noeud.textContent?.indexOf(texte) ?? -1;
    if (rang >= 0) {
      return { noeud, rang };
    }
  }
  throw new Error(`Aucun texte affiché ne porte « ${texte} ».`);
}

/** Laisse le navigateur livrer l'événement `selectionchange` en attente : l'éditeur le relit. */
export async function laisserRelireLaSelection(): Promise<void> {
  await act(() => new Promise<void>((suite) => setTimeout(suite, 0)));
}

/**
 * Colle ce texte par un événement `paste` du navigateur envoyé à la zone de saisie, porteur de ses
 * données, comme un collage de l'utilisateur ; `pasteText` de la vue, lui, ne passe par aucun
 * gestionnaire d'événement.
 */
export function collerParLeNavigateur(texte: string): void {
  const collage = new Event("paste", { bubbles: true, cancelable: true });
  const donnees = { getData: (type: string) => (type === "text/plain" ? texte : "") };
  Object.defineProperty(collage, "clipboardData", { value: donnees });
  act(() => void zoneDeSaisie().dispatchEvent(collage));
}

/** Le texte que l'éditeur tient pour sélectionné, d'après son propre état. */
export function selectionVueParLEditeur(): string {
  const { doc, selection } = editeurMonte().state;
  return doc.textBetween(selection.from, selection.to);
}

/** Pose le curseur dans ce texte, après son `decalage`-ième caractère. */
export function placerLeCurseurDans(texte: string, decalage = 1): void {
  const editeur = editeurMonte();
  const position = positionDuTexte(texte) + decalage;
  act(() => void editeur.commands.setTextSelection(position));
}

/** Sélectionne du début du premier texte à la fin du second, dans deux blocs différents. */
export function selectionnerDe(premier: string, second: string): void {
  const editeur = editeurMonte();
  const debut = positionDuTexte(premier);
  const fin = positionDuTexte(second) + second.length;
  act(() => void editeur.commands.setTextSelection({ from: debut, to: fin }));
}

/**
 * Appelle le gestionnaire de clic de l'éditeur dans ce texte : un événement `click` envoyé au DOM
 * ne l'atteint pas sous jsdom (F-028 H9). Rend vrai si le clic a été traité.
 */
export function cliquerDansLeTexte(texte: string, avecMod: boolean): boolean {
  const { view } = editeurMonte();
  const position = positionDuTexte(texte) + 1;
  const clic = new MouseEvent("click", { button: 0, bubbles: true, ctrlKey: avecMod });
  let traite = false;
  act(() => {
    traite = view.someProp("handleClick", (gerer) => gerer(view, position, clic)) === true;
  });
  return traite;
}

/**
 * Dépose un contenu riche venu d'ailleurs à la position de ce texte, comme le navigateur le livre :
 * jsdom n'a ni `DataTransfer` ni mise en page, la position du pointeur est donc donnée à la vue.
 */
export function deposerDuHtml(html: string, surLeTexte: string): void {
  const donnees = (type: string): string => (type === "text/html" ? html : "");
  deposer(surLeTexte, { getData: donnees, types: ["text/html"], files: [], dropEffect: "copy" });
}

/**
 * Déplace ce texte au début d'un autre par glisser-déposer dans la page : la vue retient le contenu
 * glissé comme elle le fait au début d'un glisser, que jsdom ne produit pas, puis reçoit le dépôt.
 */
export function deplacerLeTexte(texte: string, surLeTexte: string): void {
  selectionnerLeTexte(texte);
  const { view } = editeurMonte();
  const glisser = { slice: view.state.selection.content(), move: true };
  Object.assign(view, { dragging: glisser });
  deposer(surLeTexte, { getData: () => "", types: [], files: [], dropEffect: "move" });
}

function deposer(surLeTexte: string, transfert: Record<string, unknown>): void {
  const { view } = editeurMonte();
  const position = positionDuTexte(surLeTexte);
  const depot = new Event("drop", { bubbles: true, cancelable: true });
  Object.defineProperty(depot, "dataTransfer", { value: transfert });
  Object.assign(depot, { clientX: 0, clientY: 0 });
  const viaLaVue = view as typeof view & { posAtCoords: typeof view.posAtCoords };
  const avant = viaLaVue.posAtCoords;
  viaLaVue.posAtCoords = () => ({ pos: position, inside: -1 });
  try {
    act(() => void view.dom.dispatchEvent(depot));
  } finally {
    viaLaVue.posAtCoords = avant;
  }
}

/**
 * La commande de lien de l'éditeur tel que le module d'édition le crée, appelée directement, sans
 * passer par le panneau (F-028-AC32) ; rend ce qu'elle rend.
 */
export function appelerLaCommandeDeLien(
  nom: "setLink" | "toggleLink" | "setMark",
  adresse: unknown,
): boolean {
  const { commands } = editeurMonte();
  let rendu = false;
  act(() => {
    const attributs = { href: adresse as string };
    rendu =
      nom === "setMark"
        ? commands.setMark("link", attributs)
        : nom === "setLink"
          ? commands.setLink(attributs)
          : commands.toggleLink(attributs);
  });
  return rendu;
}

/** Les marques du texte sous le curseur, par leur nom, dans l'éditeur monté. */
export function marquesSousLeCurseur(): string[] {
  const { state } = editeurMonte();
  return (state.storedMarks ?? state.selection.$from.marks()).map((marque) => marque.type.name);
}
