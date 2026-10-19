// Bloc code du document de page (F-005, ADR-0018) : le nœud `codeBlock` de l'extension unitaire,
// au seul attribut `language`, dont l'application n'écrit et ne rend que les identifiants de sa
// liste (F-005-AC9, AC35). Le langage n'est jamais tiré d'un HTML collé ou déposé, ni des données
// d'un éditeur de code (F-005-AC7, AC36).
import { type Editor, textblockTypeInputRule } from "@tiptap/core";
import { backtickInputRegex, CodeBlock, tildeInputRegex } from "@tiptap/extension-code-block";
import type { Node as NoeudProseMirror, NodeType } from "@tiptap/pm/model";
import {
  type EditorState,
  Plugin,
  PluginKey,
  Selection,
  TextSelection,
  type Transaction,
} from "@tiptap/pm/state";
import { AttrStep } from "@tiptap/pm/transform";
import type { EditorView } from "@tiptap/pm/view";

import { langageAdmis } from "./langages.ts";
import { BLOC_CODE } from "./commandes-de-bloc.ts";
import { estAppliqueeDepuisYjs } from "./liaison.ts";

const ATTRIBUT_DU_LANGAGE = "language";
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
    const suivantes = transactions.slice(rang + 1);
    transaction.steps.forEach((etape, indice) => {
      const apres = transaction.mapping.slice(indice + 1);
      const finale = (position: number, cote: number): number =>
        suivantes.reduce((ici, une) => une.mapping.map(ici, cote), apres.map(position, cote));
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
  if ($from.node(-1).canReplaceWith($from.index(-1), $from.indexAfter(-1), type) !== true) {
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
    };
  },

  addInputRules() {
    // F-005-AC2, AC35 : un identifiant hors de la liste donne un bloc sans langage.
    return [backtickInputRegex, tildeInputRegex].map((find) =>
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
      new Plugin({
        key: new PluginKey("blocCodeDeLaPage"),
        appendTransaction: (transactions, _avant, etat) =>
          langagesHorsListeRetires(transactions, etat),
        props: {
          handlePaste: (vue, evenement) => collerDUnEditeurDeCode(type, vue, evenement),
        },
      }),
    ];
  },
}).configure({
  // F-005-AC3 : Entrée insère toujours un saut de ligne ; F-005-AC5 : Tab reste la touche de
  // navigation (H6).
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
