// Aides des tests de l'éditeur : seul fichier de test qui nomme un type de la bibliothèque
// d'édition (F-003-AC27). L'éditeur est piloté par ses commandes, ses règles de saisie et des
// événements clavier, faute de frappe réelle sous jsdom (F-003 H12) ; la frappe réelle est prouvée
// par le bout en bout (F-003-AC28).
import type { DocumentPage } from "@notionlike/document";
import { act, cleanup, render, screen } from "@testing-library/react";
import type { Editor } from "@tiptap/core";
import { NodeRangeSelection } from "@tiptap/extension-node-range";
import { NodeSelection } from "@tiptap/pm/state";
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

export interface OptionsDuMontage {
  /** L'éditeur monté en lecture seule, comme l'application le fait sans droit d'écriture. */
  readonly lectureSeule?: boolean;
}

/** Monte l'éditeur seul, comme l'application le fait : sous `StrictMode`, sur une façade de page. */
export function monterLEditeur(
  doc: Y.Doc = new Y.Doc(),
  { lectureSeule = false }: OptionsDuMontage = {},
): Montage {
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
        lectureSeule={lectureSeule}
        // F-006 : Alt+Maj+Flèche haut et bas déplacent le bloc du curseur (F-006-AC18).
        deplacementDuBloc={(frappe) => {
          if (estLaFrappe(frappe, RACCOURCIS.monterLeBloc)) {
            return "monter";
          }
          return estLaFrappe(frappe, RACCOURCIS.descendreLeBloc) ? "descendre" : undefined;
        }}
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
  // F-005 : la septième commande de bloc (F-005-AC21).
  "Bloc code",
] as const;
export type NomDeCommande = (typeof NOMS_DES_COMMANDES)[number];
/** Les commandes de mise en forme, après celles des types de bloc (F-028-AC4). */
export const NOMS_DES_COMMANDES_DE_MARQUE = ["Gras", "Italique", "Lien"] as const;
export type NomDeCommandeDeMarque = (typeof NOMS_DES_COMMANDES_DE_MARQUE)[number];
/** Les commandes de déplacement du bloc courant, en dernier (F-006-AC18). */
export const NOMS_DES_COMMANDES_DE_DEPLACEMENT = ["Monter le bloc", "Descendre le bloc"] as const;
export type NomDeCommandeDeDeplacement = (typeof NOMS_DES_COMMANDES_DE_DEPLACEMENT)[number];

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

export function commande(
  nom: NomDeCommande | NomDeCommandeDeMarque | NomDeCommandeDeDeplacement,
): HTMLElement {
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

/** Le type de la sélection de l'éditeur : `text`, `node` ou `all`. */
export function typeDeSelection(): string {
  return String(editeurMonte().state.selection.toJSON().type);
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

function deposer(
  surLeTexte: string,
  transfert: Record<string, unknown>,
  type: TypeDuGeste = "drop",
): boolean {
  return deposerA(positionDuTexte(surLeTexte), transfert, type);
}

/** L'entrée (`dragenter`) et le survol (`dragover`), qui font la cible d'un dépôt, ou le lâcher. */
type TypeDuGeste = "dragenter" | "dragover" | "drop";

/**
 * Lâcher construit par le test (F-006 H11) : jsdom n'a ni `DragEvent`, ni `DataTransfer`, ni mise en
 * page ; la position du pointeur est donnée à la vue. Rend vrai si l'action par défaut est empêchée.
 */
function deposerA(
  position: number,
  transfert: Record<string, unknown>,
  type: TypeDuGeste = "drop",
): boolean {
  const { view } = editeurMonte();
  const depot = new Event(type, { bubbles: true, cancelable: true });
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
  return depot.defaultPrevented;
}

// ——— Déplacement d'un bloc (F-006) ———

/** Position du début du bloc de premier niveau d'indice donné, ou de la fin du document. */
function debutDuBlocMonte(indice: number): number {
  const { doc } = editeurMonte().state;
  let position = 0;
  for (let rang = 0; rang < indice && rang < doc.childCount; rang += 1) {
    position += doc.child(rang).nodeSize;
  }
  return position;
}

/** L'élément glissable de la poignée de l'éditeur, qui porte la poignée de l'application. */
function elementDeLaPoignee(): HTMLElement {
  const element = document.querySelector("[data-poignee-de-bloc]")?.parentElement;
  if (!(element instanceof HTMLElement)) {
    throw new Error("La poignée de bloc n'est pas rendue.");
  }
  return element;
}

/**
 * Début d'un geste de la poignée sur le bloc d'indice `de`, comme elle le fait : jsdom n'ayant pas
 * de `DataTransfer`, le test pose lui-même la sélection du bloc et l'état de glissement de la vue.
 */
export function saisirLeBlocParSaPoignee(de: number): void {
  const { view } = editeurMonte();
  act(() => void elementDeLaPoignee().dispatchEvent(new Event("dragstart", { bubbles: true })));
  act(() => {
    const debut = debutDuBlocMonte(de);
    const fin = debutDuBlocMonte(de + 1);
    const selection = NodeRangeSelection.create(view.state.doc, debut, fin);
    view.dispatch(view.state.tr.setSelection(selection));
    Object.assign(view, { dragging: { slice: selection.content(), move: true } });
  });
}

/** Sélectionne comme nœud le bloc de premier niveau d'indice donné, entier. */
export function selectionnerLeBlocEntier(indice: number): void {
  const { view } = editeurMonte();
  act(() => {
    const selection = NodeSelection.create(view.state.doc, debutDuBlocMonte(indice));
    view.dispatch(view.state.tr.setSelection(selection));
  });
}

/** Fin du geste de la poignée, après un lâcher ou un abandon (Échap, lâcher hors de l'éditeur). */
export function finirLeGesteDeLaPoignee(): void {
  const { view } = editeurMonte();
  Object.assign(view, { dragging: null });
  act(() => void elementDeLaPoignee().dispatchEvent(new Event("dragend", { bubbles: true })));
}

/**
 * Glisse le bloc d'indice `de` par sa poignée et le lâche dans l'intervalle d'indice `intervalle`
 * entre deux blocs (0 : avant le premier). Rend vrai si l'action par défaut est empêchée.
 */
export function glisserLeBlocParSaPoignee(de: number, intervalle: number): boolean {
  saisirLeBlocParSaPoignee(de);
  const transfert = { getData: () => "", types: [], files: [], dropEffect: "move" };
  const empeche = deposerA(debutDuBlocMonte(intervalle), transfert);
  finirLeGesteDeLaPoignee();
  return empeche;
}

/**
 * Lâche des fichiers dans l'éditeur, sur ce texte, seuls ou avec du texte : un fichier HTML nommé
 * `image.png`, qui n'est pas une image conforme (F-006-AC35). Avec `dragenter` ou `dragover`, seul
 * ce geste qui précède le lâcher est envoyé. Rend vrai si l'action par défaut est empêchée.
 */
export function deposerUnFichier(
  surLeTexte: string,
  avecDuTexte: boolean,
  type: TypeDuGeste = "drop",
): boolean {
  const fichier = new File(["<p>contenu du fichier</p>"], "image.png", { type: "text/html" });
  const texte = avecDuTexte ? "texte joint au fichier" : "";
  return deposer(
    surLeTexte,
    {
      getData: (format: string) => (format === "text/plain" ? texte : ""),
      types: avecDuTexte ? ["Files", "text/plain"] : ["Files"],
      files: [fichier],
      dropEffect: "copy",
    },
    type,
  );
}

/** Les options du curseur de dépôt, telles que le module d'édition a créé l'éditeur. */
export function optionsDuCurseurDeDepot(): Record<string, unknown> | undefined {
  const extension = editeurMonte().extensionManager.extensions.find(
    (une) => une.name === "dropCursor",
  );
  return extension?.options as Record<string, unknown> | undefined;
}

/** Texte de chaque bloc de premier niveau, dans l'ordre. */
export function textesDesBlocs(): string[] {
  const { doc } = editeurMonte().state;
  const textes: string[] = [];
  doc.forEach((noeud) => textes.push(noeud.textContent));
  return textes;
}

/** Le bloc de premier niveau du curseur, et la position du curseur dans son texte. */
export function curseurDansLeBloc(): { readonly bloc: number; readonly decalage: number } {
  const { selection } = editeurMonte().state;
  const bloc = selection.$from.index(0);
  return { bloc, decalage: selection.from - debutDuBlocMonte(bloc) };
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

// ——— Bloc code et menu slash (F-005) ———

export const NOM_DU_SELECTEUR_DE_LANGAGE = "Langage du bloc code";
export const NOM_DU_MENU_SLASH = "Commandes de bloc";

/** Le sélecteur de langage de la barre de blocs ; `null` s'il n'est pas proposé. */
export function selecteurDeLangage(): HTMLSelectElement | null {
  return screen.queryByRole<HTMLSelectElement>("combobox", { name: NOM_DU_SELECTEUR_DE_LANGAGE });
}

/** Choisit un langage dans le sélecteur, comme le clavier ou la souris le font. */
export function choisirLeLangage(valeur: string): void {
  const selecteur = selecteurDeLangage();
  if (selecteur === null) {
    throw new Error("Le sélecteur de langage n'est pas proposé.");
  }
  act(() => {
    selecteur.value = valeur;
    selecteur.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

// Borne du parcours : bien plus de pas que la barre n'a d'éléments.
const PAS_MAX_DANS_LA_BARRE = 32;

/**
 * Depuis l'élément de la barre qui a le focus, Flèche droite jusqu'au sélecteur de langage
 * (F-005-AC22) : rend le sélecteur dès qu'il a le focus, `null` si le parcours revient à son point
 * de départ, ou s'épuise, sans l'avoir atteint.
 */
export function atteindreLeSelecteurParLesFleches(): HTMLSelectElement | null {
  const depart = document.activeElement;
  for (let pas = 0; pas < PAS_MAX_DANS_LA_BARRE; pas += 1) {
    presser("ArrowRight");
    const cible = document.activeElement;
    const selecteur = selecteurDeLangage();
    if (selecteur !== null && cible === selecteur) {
      return selecteur;
    }
    if (cible === depart) {
      return null;
    }
  }
  return null;
}

const PAS_DU_SELECTEUR = { ArrowDown: 1, ArrowUp: -1 } as const;

/**
 * Flèche bas ou haut sur le sélecteur qui a le focus. Ni jsdom ni user-event 14.6.7 ne jouent
 * l'action par défaut d'un `select` fermé : l'aide la joue comme un navigateur (option voisine,
 * puis `input` et `change`), et seulement si personne n'a annulé la frappe en chemin ; une barre ou
 * un éditeur qui avaleraient la flèche laissent donc la valeur inchangée.
 */
export function presserDansLeSelecteur(touche: keyof typeof PAS_DU_SELECTEUR): void {
  const selecteur = document.activeElement;
  if (!(selecteur instanceof HTMLSelectElement)) {
    throw new Error("Aucun sélecteur n'a le focus.");
  }
  if (presser(touche)) {
    return;
  }
  const rang = selecteur.selectedIndex + PAS_DU_SELECTEUR[touche];
  if (rang < 0 || rang >= selecteur.options.length) {
    return;
  }
  act(() => {
    selecteur.selectedIndex = rang;
    selecteur.dispatchEvent(new Event("input", { bubbles: true }));
    selecteur.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

/** La liste d'options du menu slash ; `null` si le menu est fermé. */
export function menuSlash(): HTMLElement | null {
  return screen.queryByRole("listbox", { name: NOM_DU_MENU_SLASH });
}

/** Les commandes que le menu slash liste, dans l'ordre, et l'état de chacune. */
export function optionsDuMenu(): { readonly nom: string; readonly active: boolean }[] {
  return [...(menuSlash()?.querySelectorAll("[role=option]") ?? [])].map((option) => ({
    nom: option.textContent,
    active: option.getAttribute("aria-selected") === "true",
  }));
}

/** Les noms des commandes que le menu slash liste ; vide s'il est fermé. */
export function nomsDuMenu(): string[] {
  return optionsDuMenu().map((option) => option.nom);
}

/** L'option du menu slash qui porte ce nom. */
export function optionDuMenu(nom: string): HTMLElement {
  return screen.getByRole("option", { name: nom });
}

/** Laisse passer les tâches que l'utilitaire de suggestion attend (éléments asynchrones). */
export async function laisserLeMenuSuivre(): Promise<void> {
  await act(() => new Promise<void>((suite) => setTimeout(suite, 0)));
}

/** Colle ces données, type par type, par un événement `paste` envoyé à la zone de saisie. */
export function collerLesDonnees(donnees: Readonly<Record<string, string>>): void {
  const collage = new Event("paste", { bubbles: true, cancelable: true });
  const presse = { getData: (type: string) => donnees[type] ?? "", types: Object.keys(donnees) };
  Object.defineProperty(collage, "clipboardData", { value: presse });
  act(() => void zoneDeSaisie().dispatchEvent(collage));
}

/** Le bloc de texte où se trouve le curseur : son nœud et son texte. */
export function blocDuCurseur(): { readonly noeud: string; readonly texte: string } {
  const { $from } = editeurMonte().state.selection;
  return { noeud: $from.parent.type.name, texte: $from.parent.textContent };
}

/** Place le curseur au début du bloc de texte qui contient ce texte. */
export function placerLeCurseurAuDebutDe(texte: string): void {
  const editeur = editeurMonte();
  const position = positionDuTexte(texte);
  const debut = editeur.state.doc.resolve(position).start();
  act(() => void editeur.commands.setTextSelection(debut));
}

/** Place le curseur à la fin du bloc de texte qui contient ce texte. */
export function placerLeCurseurALaFinDe(texte: string): void {
  const editeur = editeurMonte();
  const position = positionDuTexte(texte);
  const fin = editeur.state.doc.resolve(position).end();
  act(() => void editeur.commands.setTextSelection(fin));
}

/** Les attributs que porte l'élément de l'éditeur, par leur nom. */
export function attributDeLEditeur(nom: string): string | null {
  return zoneDeSaisie().getAttribute(nom);
}

/** Place le curseur au début du dernier bloc de texte du document, vide ou non. */
export function placerLeCurseurDansLeDernierBloc(): void {
  const editeur = editeurMonte();
  let debut = -1;
  editeur.state.doc.descendants((noeud, position) => {
    if (noeud.isTextblock) {
      debut = position + 1;
    }
  });
  act(() => void editeur.commands.setTextSelection(debut));
}

/**
 * Une commande du bloc code de l'éditeur tel que le module d'édition le crée, appelée directement
 * avec ce langage, sans passer par la barre ni le sélecteur (F-005-AC35) ; rend ce qu'elle rend.
 */
type AppelDuBlocCode = (commandes: Editor["commands"], attributs: { language: string }) => boolean;

const COMMANDES_DU_BLOC_CODE = {
  setCodeBlock: (commandes, attributs) => commandes.setCodeBlock(attributs),
  toggleCodeBlock: (commandes, attributs) => commandes.toggleCodeBlock(attributs),
  setNode: (commandes, attributs) => commandes.setNode("codeBlock", attributs),
  updateAttributes: (commandes, attributs) => commandes.updateAttributes("codeBlock", attributs),
} satisfies Record<string, AppelDuBlocCode>;

export function appelerUneCommandeDuBlocCode(
  nom: keyof typeof COMMANDES_DU_BLOC_CODE,
  langage: unknown,
): boolean {
  const { commands } = editeurMonte();
  const attributs = { language: langage as string };
  let rendu = false;
  act(() => {
    rendu = COMMANDES_DU_BLOC_CODE[nom](commands, attributs);
  });
  return rendu;
}

/**
 * Efface le caractère avant le curseur, comme Retour arrière dans un texte : jsdom n'a pas l'action
 * par défaut du navigateur, que ProseMirror relit d'ordinaire.
 */
export function effacerAvantLeCurseur(): void {
  const { view } = editeurMonte();
  act(() => {
    const { from } = view.state.selection;
    view.dispatch(view.state.tr.delete(from - 1, from));
  });
}
