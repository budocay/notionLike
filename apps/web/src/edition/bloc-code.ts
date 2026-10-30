// Bloc code du document de page (F-005, ADR-0018) : le nœud `codeBlock` de l'extension unitaire,
// au seul attribut `language`, dont l'application n'écrit et ne rend que les identifiants de sa
// liste (F-005-AC9, AC35). Le langage n'est jamais tiré d'un HTML collé ou déposé, ni des données
// d'un éditeur de code (F-005-AC7, AC36).
import { type Editor, textblockTypeInputRule } from "@tiptap/core";
import { CodeBlock } from "@tiptap/extension-code-block";
import type { Node as NoeudProseMirror, NodeType } from "@tiptap/pm/model";
import {
  type EditorState,
  Plugin,
  PluginKey,
  Selection,
  TextSelection,
  type Transaction,
} from "@tiptap/pm/state";
import { keydownHandler } from "@tiptap/pm/keymap";
import { AttrStep } from "@tiptap/pm/transform";
import type { EditorView } from "@tiptap/pm/view";

import { langageAdmis } from "./langages.ts";
import { BLOC_CODE } from "./commandes-de-bloc.ts";
import {
  appliquer,
  type Modification,
  modificationDEntree,
  modificationsDeMajTab,
  modificationsDeTab,
  type SelectionDuBlocCode,
  selectionDuBlocCode,
} from "./indentation.ts";
import { PARAGRAPHE_DE_FIN } from "./fin-de-page.ts";
import { estAppliqueeDepuisYjs } from "./liaison.ts";

const ATTRIBUT_DU_LANGAGE = "language";
// Trois accents graves ou tildes, un identifiant facultatif sans espace, puis l'espace (F-005-AC2) :
// celles de l'extension n'admettent que `[a-z]+`, et « ```JS », « ```c++ » restaient du texte.
const OUVERTURES_DU_BLOC_CODE = [/^```(\S+)?\s$/, /^~~~(\S+)?\s$/];
const PREFIXE_DE_LA_CLASSE = "language-";
const DONNEES_D_UN_EDITEUR_DE_CODE = "vscode-editor-data";

/** La classe de l'élément `code` : seul un identifiant de la liste en donne une (F-005-AC9). */
function classeDuLangage(valeur: unknown): string | null {
  const langage = langageAdmis(valeur);
  return langage === null ? null : `${PREFIXE_DE_LA_CLASSE}${langage}`;
}

// ——— Garde des langages, à l'écriture (F-005-AC35) ———

/** Une étendue du document produit par les transactions, où un pas a inscrit du contenu. */
interface Etendue {
  readonly de: number;
  readonly a: number;
}

/**
 * Reporte une position laissée par le pas `indice` de la transaction `rang` jusqu'au document
 * final : par les pas qui le suivent, puis par les transactions suivantes.
 */
function versLeDocumentFinal(
  transactions: readonly Transaction[],
  rang: number,
  indice: number,
): (position: number, cote: number) => number {
  const apres = transactions[rang]?.mapping.slice(indice + 1);
  const suivantes = transactions.slice(rang + 1);
  return (position, cote) =>
    suivantes.reduce(
      (ici, une) => une.mapping.map(ici, cote),
      apres?.map(position, cote) ?? position,
    );
}

/** Les étendues inscrites par ces transactions locales, et les positions des attributs posés. */
function inscriptionsLocales(transactions: readonly Transaction[]): {
  readonly etendues: Etendue[];
  readonly attributs: number[];
} {
  const etendues: Etendue[] = [];
  const attributs: number[] = [];
  transactions.forEach((transaction, rang) => {
    if (estAppliqueeDepuisYjs(transaction) || !transaction.docChanged) {
      return;
    }
    transaction.steps.forEach((etape, indice) => {
      const finale = versLeDocumentFinal(transactions, rang, indice);
      if (etape instanceof AttrStep && etape.attr === ATTRIBUT_DU_LANGAGE) {
        attributs.push(finale(etape.pos, 1));
      }
      transaction.mapping.maps[indice]?.forEach((_avantDe, _avantA, de, a) => {
        if (a > de) {
          etendues.push({ de: finale(de, -1), a: finale(a, 1) });
        }
      });
    });
  });
  return { etendues, attributs };
}

/** Les blocs code inscrits ou dont le langage a été posé, avec une valeur hors de la liste. */
function blocsHorsListe(
  document: NoeudProseMirror,
  transactions: readonly Transaction[],
): number[] {
  const { etendues, attributs } = inscriptionsLocales(transactions);
  if (etendues.length === 0 && attributs.length === 0) {
    return [];
  }
  const fautifs: number[] = [];
  document.descendants((noeud, position) => {
    if (noeud.type.name !== BLOC_CODE) {
      return true;
    }
    const valeur: unknown = noeud.attrs[ATTRIBUT_DU_LANGAGE];
    const touche =
      attributs.includes(position) || etendues.some(({ de, a }) => de <= position && position < a);
    if (touche && valeur !== null && langageAdmis(valeur) === null) {
      fautifs.push(position);
    }
    return false;
  });
  return fautifs;
}

/**
 * Seule autorité à l'écriture : tout bloc code qu'une transaction locale inscrit (commande, règle de
 * saisie, collage, dépôt, déplacement) ou dont elle pose le langage, avec une valeur hors de la
 * liste, est réécrit sans langage avant que la liaison n'écrive dans Yjs : une seule mise à jour.
 * Un document reçu n'est jamais réécrit, et le bloc où l'on tape n'est pas « inscrit » (AC9).
 */
function langagesHorsListeRetires(
  transactions: readonly Transaction[],
  etat: EditorState,
): Transaction | null {
  const fautifs = blocsHorsListe(etat.doc, transactions);
  if (fautifs.length === 0) {
    return null;
  }
  const tr = etat.tr;
  fautifs.forEach((position) => tr.setNodeAttribute(position, ATTRIBUT_DU_LANGAGE, null));
  return tr;
}

// ——— Collage depuis un éditeur de code (F-005-AC36) ———

function lireLesDonnees(texte: string): unknown {
  try {
    return JSON.parse(texte);
  } catch {
    return undefined;
  }
}

function estUnObjet(valeur: unknown): boolean {
  return typeof valeur === "object" && valeur !== null && !Array.isArray(valeur);
}

/**
 * Vrai si le schéma admet un bloc code à la place des blocs que la sélection touche. Une sélection
 * de tout le document (Mod+A) ou d'un bloc entier (poignée du curseur) commence à la profondeur 0 :
 * le bloc code y remplace les blocs sélectionnés, comme tout collage remplace la sélection.
 */
function blocCodeAdmisALaPlaceDe({ $from, $to }: Selection, type: NodeType): boolean {
  return $from.depth === 0
    ? $from.parent.canReplaceWith($from.index(), $to.index(), type)
    : $from.node(-1).canReplaceWith($from.index(-1), $from.indexAfter(-1), type);
}

/**
 * Un collage qui porte les données d'un éditeur de code devient un bloc code SANS langage, quel
 * que soit celui qu'elles annoncent ; des données malformées laissent le collage au chemin du
 * texte, sans exception. Rien dans un bloc code, où ProseMirror colle du texte brut (AC7), ni là où
 * le schéma refuse un bloc code (premier paragraphe d'un élément de liste : AC11).
 */
function collerDUnEditeurDeCode(type: NodeType, vue: EditorView, evenement: ClipboardEvent) {
  const donnees = evenement.clipboardData ?? null;
  const { $from } = vue.state.selection;
  if (donnees === null || $from.parent.type === type) {
    return false;
  }
  const brutes = donnees.getData(DONNEES_D_UN_EDITEUR_DE_CODE);
  const texte = donnees.getData("text/plain");
  if (brutes === "" || texte === "" || !estUnObjet(lireLesDonnees(brutes))) {
    return false;
  }
  if (!blocCodeAdmisALaPlaceDe(vue.state.selection, type)) {
    return false;
  }
  const bloc = type.create(null, vue.state.schema.text(texte.replace(/\r\n?/g, "\n")));
  const tr = vue.state.tr.replaceSelectionWith(bloc);
  if (tr.selection.$from.parent.type !== type) {
    tr.setSelection(TextSelection.near(tr.doc.resolve(Math.max(0, tr.selection.from - 2))));
  }
  vue.dispatch(tr.setMeta("paste", true));
  return true;
}

// ——— Clavier (F-005-AC4, H6) ———

/** Retour arrière en tête d'un bloc code vide : un paragraphe vide, à la même place, liste comprise. */
function blocVideEnParagraphe(editeur: Editor): boolean {
  const { empty, $anchor } = editeur.state.selection;
  if (!empty || $anchor.parent.type.name !== BLOC_CODE || $anchor.parent.content.size > 0) {
    return false;
  }
  return editeur.commands.command(({ tr, state }) => {
    const paragraphe = state.schema.nodes.paragraph;
    if (paragraphe === undefined) {
      return false;
    }
    tr.setNodeMarkup($anchor.before(), paragraphe);
    return true;
  });
}

/**
 * Flèche bas à la fin d'un bloc code : un paragraphe après lui s'il est le dernier bloc de la page ;
 * sinon le curseur passe au bloc suivant, liste comprise, sans rien écrire (F-005-AC4).
 */
function sortieParLeBas(editeur: Editor): boolean {
  const { selection, doc } = editeur.state;
  const { empty, $from } = selection;
  if (!empty || $from.parent.type.name !== BLOC_CODE) {
    return false;
  }
  if ($from.parentOffset !== $from.parent.content.size) {
    return false;
  }
  const suivant = Selection.findFrom(doc.resolve($from.after()), 1, true);
  if (suivant === null) {
    return editeur.commands.exitCode();
  }
  return editeur.commands.command(({ tr }) => {
    tr.setSelection(suivant);
    return true;
  });
}

// ——— Indentation et sortie au clavier (F-033-AC15 à AC22) ———

/**
 * Sortie armée (F-033-AC22, H8) : état du greffon de la page, ouvert par Échap dans un bloc code ;
 * Tab ou Maj+Tab qui suit n'indente pas et laisse le navigateur déplacer le focus.
 */
const CLE_DE_LA_PAGE = new PluginKey<boolean>("blocCodeDeLaPage");

function sortieArmee(etat: EditorState): boolean {
  return CLE_DE_LA_PAGE.getState(etat) === true;
}

function armerLaSortie(vue: EditorView, armee: boolean): void {
  if (sortieArmee(vue.state) !== armee) {
    vue.dispatch(vue.state.tr.setMeta(CLE_DE_LA_PAGE, armee));
  }
}

/** Un clic ou la perte du focus désarme ; l'événement suit son cours. */
function desarmer(vue: EditorView): boolean {
  armerLaSortie(vue, false);
  return false;
}

/** Vrai si la sélection n'a pas bougé d'un état à l'autre, lue dans un bloc code. */
function memeSelection(avant: EditorState, apres: EditorState): boolean {
  const [une, autre] = [selectionDuBlocCode(avant), selectionDuBlocCode(apres)];
  return (
    une !== undefined &&
    autre !== undefined &&
    une.debut === autre.debut &&
    une.ancre === autre.ancre &&
    une.tete === autre.tete
  );
}

// Tab et Maj+Tab, reconnues par les noms de liaison de l'éditeur, sans lire la touche (F-004-AC31).
const EST_UNE_TABULATION = keydownHandler({ Tab: () => true, "Shift-Tab": () => true });
// Une touche de modification seule (Maj, Ctrl, Alt, Méta) se tient à gauche ou à droite du clavier :
// elle ne désarme pas, sans quoi Maj+Tab ne sortirait jamais.
const EMPLACEMENTS_DES_MODIFICATEURS = new Set([1, 2]);

/** Toute autre touche que Tab ou Maj+Tab, hors modificateur seul, désarme la sortie. */
function desarmerSurUneTouche(vue: EditorView, evenement: { readonly location: number }): boolean {
  if (
    sortieArmee(vue.state) &&
    !EMPLACEMENTS_DES_MODIFICATEURS.has(evenement.location) &&
    !EST_UNE_TABULATION(vue, evenement as Parameters<typeof EST_UNE_TABULATION>[1])
  ) {
    armerLaSortie(vue, false);
  }
  return false;
}

/**
 * La sélection, si la touche du bloc code s'y applique : éditeur modifiable, aucune composition en
 * cours (garde de l'application, en plus de celle de la vue), sélection entière dans un même bloc
 * code. Sinon la touche garde son comportement d'avant (F-033-AC20).
 */
function selectionPrise(editeur: Editor): SelectionDuBlocCode | undefined {
  if (!editeur.isEditable || editeur.view.composing) {
    return undefined;
  }
  return selectionDuBlocCode(editeur.state);
}

type Calcul = (texte: string, de: number, a: number) => readonly Modification[];

/**
 * Tab et Maj+Tab : sortie armée, la touche est laissée au navigateur ; sinon une seule transaction,
 * et la touche est prise même sans rien à modifier : le focus reste (F-033-AC17, AC19).
 */
function indenter(editeur: Editor, calculer: Calcul): boolean {
  const lue = selectionPrise(editeur);
  if (lue === undefined) {
    return false;
  }
  if (sortieArmee(editeur.state)) {
    armerLaSortie(editeur.view, false);
    return false;
  }
  const modifications = calculer(
    lue.bloc.textContent,
    Math.min(lue.ancre, lue.tete),
    Math.max(lue.ancre, lue.tete),
  );
  if (modifications.length === 0) {
    return true;
  }
  return editeur.commands.command(({ tr }) => {
    appliquer(tr, lue, modifications);
    return true;
  });
}

// Deux lignes vides finales (F-040-AC4, H3) : deux sauts de ligne de suite en fin de texte, chacun
// pouvant porter l'indentation reprise par F-033-AC18 (espaces ou tabulations seuls).
const DEUX_LIGNES_VIDES_FINALES = /\n[ \t]*\n[ \t]*$/;

/**
 * Entrée, curseur à la toute fin d'un bloc code qui se termine par deux lignes vides : elles sont
 * retirées et un paragraphe suit le bloc dans son parent, comme Mod+Entrée, en une seule transaction
 * (F-040-AC4). Le seuil se lit dans le texte, sans état : il tient après un rechargement.
 */
function sortieParEntree(editeur: Editor, lue: SelectionDuBlocCode): boolean {
  const texte = lue.bloc.textContent;
  const fin = DEUX_LIGNES_VIDES_FINALES.exec(texte);
  if (lue.ancre !== lue.tete || lue.tete !== texte.length || fin === null) {
    return false;
  }
  return editeur
    .chain()
    .command(({ tr }) => {
      tr.delete(lue.debut + fin.index, lue.debut + texte.length).setMeta(PARAGRAPHE_DE_FIN, "code");
      return true;
    })
    .exitCode()
    .run();
}

/**
 * Entrée : un saut de ligne qui reprend l'indentation, en une transaction (F-033-AC18), sauf en fin
 * de bloc après deux lignes vides, où elle sort du bloc (F-040-AC4). Rien ne dépend de
 * l'événement : l'Entrée synthétique qu'Android et iOS font rappeler suit ce chemin.
 */
function sautDeLigneIndente(editeur: Editor): boolean {
  const lue = selectionPrise(editeur);
  if (lue === undefined) {
    return false;
  }
  if (sortieParEntree(editeur, lue)) {
    return true;
  }
  const [de, a] = [Math.min(lue.ancre, lue.tete), Math.max(lue.ancre, lue.tete)];
  const modification = modificationDEntree(lue.bloc.textContent, de, a);
  return editeur.commands.command(({ tr }) => {
    appliquer(tr, lue, [modification]);
    const apres = lue.debut + de + modification.insere.length;
    tr.setSelection(TextSelection.create(tr.doc, apres)).scrollIntoView();
    return true;
  });
}

/** Échap : arme la sortie, sans rien écrire ni déplacer le curseur (F-033-AC22). */
function armerParEchap(editeur: Editor): boolean {
  if (selectionPrise(editeur) === undefined) {
    return false;
  }
  armerLaSortie(editeur.view, true);
  return true;
}

const RACCOURCI_RETIRE = "Mod-Alt-c";

export const BlocCode = CodeBlock.extend({
  addAttributes() {
    return {
      // Rien n'est tiré d'un HTML collé ou déposé (AC7) ; la liaison Yjs ne passe pas par ici.
      [ATTRIBUT_DU_LANGAGE]: { default: null, parseHTML: () => null, rendered: false },
    };
  },

  renderHTML({ node }) {
    return ["pre", {}, ["code", { class: classeDuLangage(node.attrs[ATTRIBUT_DU_LANGAGE]) }, 0]];
  },

  addKeyboardShortcuts() {
    // `Mod-Alt-c` convertirait sans juger la disponibilité (F-005-AC11) : retiré.
    const raccourcis = Object.entries(this.parent?.() ?? {}).filter(
      ([touche]) => touche !== RACCOURCI_RETIRE,
    );
    return {
      ...Object.fromEntries(raccourcis),
      Backspace: () => blocVideEnParagraphe(this.editor),
      ArrowDown: () => sortieParLeBas(this.editor),
      // F-033 : Tab indente, Maj+Tab désindente, Entrée reprend l'indentation, Échap arme la sortie.
      Tab: () => indenter(this.editor, modificationsDeTab),
      "Shift-Tab": () => indenter(this.editor, modificationsDeMajTab),
      Enter: () => sautDeLigneIndente(this.editor),
      Escape: () => armerParEchap(this.editor),
    };
  },

  addInputRules() {
    // F-005-AC2, AC35 : un identifiant hors de la liste donne un bloc sans langage.
    return OUVERTURES_DU_BLOC_CODE.map((find) =>
      textblockTypeInputRule({
        find,
        type: this.type,
        getAttributes: (trouve) => ({ [ATTRIBUT_DU_LANGAGE]: langageAdmis(trouve[1]) }),
      }),
    );
  },

  addProseMirrorPlugins() {
    const { type } = this;
    return [
      new Plugin<boolean>({
        key: CLE_DE_LA_PAGE,
        // Sortie armée : posée par Échap, retirée par une autre touche, un clic, la perte du focus
        // ou un changement de la sélection (F-033-AC22).
        state: {
          init: () => false,
          apply: (transaction, armee, avant, apres) => {
            const demandee: unknown = transaction.getMeta(CLE_DE_LA_PAGE);
            return typeof demandee === "boolean" ? demandee : armee && memeSelection(avant, apres);
          },
        },
        appendTransaction: (transactions, _avant, etat) =>
          langagesHorsListeRetires(transactions, etat),
        props: {
          handlePaste: (vue, evenement) => collerDUnEditeurDeCode(type, vue, evenement),
          handleDOMEvents: {
            keydown: desarmerSurUneTouche,
            mousedown: desarmer,
            blur: desarmer,
          },
        },
      }),
    ];
  },
}).configure({
  // F-005-AC3 amendé par F-040-AC4 : la sortie par Entrée répétée est celle de l'application
  // (`sortieParEntree`), pas celle de l'extension ; Tab et Maj+Tab sont ceux de l'application
  // (F-033-AC15 à AC17, H3), pas l'indentation de l'extension.
  exitOnTripleEnter: false,
  enableTabIndentation: false,
});

/**
 * Le choix du sélecteur « Langage du bloc code » : un identifiant de la liste, ou aucun langage
 * pour « Texte brut » ; le texte du bloc ne change pas (F-005-AC6).
 */
export function choisirLeLangage(editeur: Editor, valeur: string): void {
  editeur
    .chain()
    .updateAttributes(BLOC_CODE, { [ATTRIBUT_DU_LANGAGE]: langageAdmis(valeur) })
    .run();
}
