// Les types de bloc que la barre de blocs et le menu slash savent donner (F-003-AC8, F-005-AC21) et
// lire. Aucune commande n'écrit un nœud, un attribut ou un niveau hors du schéma (F-003-AC17), et
// aucune n'est appliquée sans avoir été jugée, à blanc, sur l'état courant (F-005-AC11).
import { type ChainedCommands, CommandManager, type Editor } from "@tiptap/core";
import type { Node as NoeudProseMirror, NodeType, ResolvedPos } from "@tiptap/pm/model";
import { EditorState, Selection, TextSelection, type Transaction } from "@tiptap/pm/state";

import {
  BLOC_CODE,
  NIVEAUX_DE_TITRE,
  type NiveauDeTitre,
  type NoeudDeListe,
  type TypeDeBloc,
} from "./commandes-de-bloc.ts";

/** L'étendue retirée du texte avant de changer le type : la séquence du menu slash. */
export interface Retrait {
  readonly from: number;
  readonly to: number;
}

const ELEMENT_DE_LISTE = "listItem";
const TITRE = "heading";
const PARAGRAPHE = "paragraph";
const SAUTS_DE_LIGNE = /\n/g;
const ESPACE = " ";

function estUnNiveauDeTitre(niveau: unknown): niveau is NiveauDeTitre {
  return NIVEAUX_DE_TITRE.some((un) => un === niveau);
}

/** Le type du bloc de cette position, liste comprise ; `undefined` si la barre ne sait le nommer. */
function typeA($from: ResolvedPos): TypeDeBloc | undefined {
  // Un bloc code se nomme comme tel, même dans un élément de liste (F-005-AC1).
  if ($from.parent.type.name === BLOC_CODE) {
    return { forme: "code" };
  }
  const liste = listesAutour($from).at(-1);
  if (liste !== undefined) {
    return { forme: "liste", noeud: liste };
  }
  if ($from.parent.type.name !== TITRE) {
    return { forme: "paragraphe" };
  }
  const niveau: unknown = $from.parent.attrs.level;
  return estUnNiveauDeTitre(niveau) ? { forme: "titre", niveau } : undefined;
}

interface Bornes {
  readonly $from: ResolvedPos;
  readonly $to: ResolvedPos;
}

/**
 * Les bornes que la barre, le menu et les commandes lisent : celles d'une sélection de texte, ou,
 * pour une sélection de nœud (la poignée du curseur dans un bloc vide) ou de tout le document
 * (Mod+A), qui commencent à la profondeur 0, celles du texte qu'elle couvre, du premier bloc de
 * texte au dernier. Une sélection qui ne couvre aucun bloc de texte garde les siennes.
 */
export function bornesLues(selection: Selection): Bornes {
  if (selection instanceof TextSelection) {
    return selection;
  }
  const debut = Selection.findFrom(selection.$from, 1, true);
  const fin = Selection.findFrom(selection.$to, -1, true);
  return debut === null || fin === null || debut.from > selection.to || fin.to < selection.from
    ? selection
    : { $from: debut.$from, $to: fin.$to };
}

/** `undefined` : un bloc que la barre ne sait pas nommer (titre d'un niveau hors de 1 à 3). */
export function typeDuBlocCourant(editeur: Editor): TypeDeBloc | undefined {
  return typeA(bornesLues(editeur.state.selection).$from);
}

/** Les listes qui contiennent cette position, de la plus extérieure à la plus proche. */
function listesAutour($from: ResolvedPos): NoeudDeListe[] {
  const listes: NoeudDeListe[] = [];
  for (let profondeur = 1; profondeur <= $from.depth; profondeur += 1) {
    const nom = $from.node(profondeur).type.name;
    if (nom === "bulletList" || nom === "orderedList") {
      listes.push(nom);
    }
  }
  return listes;
}

function dejaDeCeType(noeud: NoeudProseMirror, type: NodeType, niveau?: NiveauDeTitre): boolean {
  return noeud.type === type && (niveau === undefined || noeud.attrs.level === niveau);
}

/** Les blocs de texte de la sélection à changer ; `undefined` si le schéma n'en admet aucun. */
function blocsAChanger(
  tr: Transaction,
  type: NodeType,
  niveau?: NiveauDeTitre,
): number[] | undefined {
  const cibles: number[] = [];
  let refuse = false;
  tr.doc.nodesBetween(tr.selection.from, tr.selection.to, (noeud, position, parent, index) => {
    if (!noeud.isTextblock) {
      return true;
    }
    if (dejaDeCeType(noeud, type, niveau)) {
      return false;
    }
    if (parent?.canReplaceWith(index, index + 1, type) === true) {
      cibles.push(position);
    } else {
      refuse = true;
    }
    return false;
  });
  return refuse && cibles.length === 0 ? undefined : cibles;
}

/**
 * Remplace chaque saut de ligne de ce bloc par une espace, dans la transaction : hors du bloc code,
 * le schéma n'a pas de saut de ligne, et ProseMirror en remplacerait un lui-même à la frappe
 * suivante, en relisant le DOM (F-005-AC1, H16).
 */
function remplacerLesSautsDeLigne(tr: Transaction, debut: number, noeud: NoeudProseMirror): void {
  const positions: number[] = [];
  noeud.descendants((enfant, decalage) => {
    for (const trouve of (enfant.text ?? "").matchAll(SAUTS_DE_LIGNE)) {
      positions.push(debut + 1 + decalage + trouve.index);
    }
  });
  // Un caractère remplacé par un seul autre : aucune position ne se décale.
  positions.forEach((position) => tr.insertText(ESPACE, position, position + 1));
}

/**
 * Donne ce type de nœud à chaque bloc de texte de la sélection que son parent admet à cette place.
 * Vrai si un bloc a changé, ou si tous l'avaient déjà ; faux si le schéma n'en admet aucun. Vers le
 * bloc code, les marques sont retirées (F-005-AC29) ; vers un paragraphe ou un titre, chaque saut de
 * ligne devient une espace, explicitement, et tout autre caractère reste (F-005-AC1).
 */
function changerLesBlocsDeTexte(tr: Transaction, type: NodeType, niveau?: NiveauDeTitre): boolean {
  const cibles = blocsAChanger(tr, type, niveau);
  if (cibles === undefined) {
    return false;
  }
  const attributs = niveau === undefined ? null : { level: niveau };
  const depart = tr.mapping.maps.length;
  for (const position of cibles) {
    const ici = tr.mapping.slice(depart).map(position);
    const noeud = tr.doc.nodeAt(ici);
    if (noeud === null) {
      return false;
    }
    if (type.name === BLOC_CODE) {
      tr.setBlockType(ici, ici + noeud.nodeSize, type, attributs);
    } else {
      remplacerLesSautsDeLigne(tr, ici, noeud);
      tr.setNodeMarkup(ici, type, attributs);
    }
  }
  return true;
}

function changerEn(nom: string, niveau?: NiveauDeTitre) {
  return ({ tr }: { readonly tr: Transaction }): boolean => {
    const type = tr.doc.type.schema.nodes[nom];
    return type !== undefined && changerLesBlocsDeTexte(tr, type, niveau);
  };
}

/** Une étape de la composition : des commandes, appliquées à l'état que laisse l'étape précédente. */
type Etape = (chaine: ChainedCommands) => ChainedCommands;

/**
 * Les étapes qui donnent ce type au bloc de cette position. Chaque étape rend faux si le schéma la
 * refuse, sans repli qui changerait la structure (F-005-AC11 ; veille : `setNode` sort de sa liste
 * le premier paragraphe d'un élément).
 */
function etapesDuType($from: ResolvedPos, type: TypeDeBloc): Etape[] {
  const listes = listesAutour($from);
  const dansUnBlocCode = $from.parent.type.name === BLOC_CODE;
  switch (type.forme) {
    case "code":
      // Le bloc code ne sort jamais des listes : refusé dans le premier paragraphe d'un élément.
      return [(chaine) => chaine.command(changerEn(BLOC_CODE))];
    case "liste":
      if (listes.at(-1) === type.noeud) {
        // Déjà dans cette liste : un bloc code y redevient un paragraphe, rien d'autre ne change.
        return dansUnBlocCode ? [(chaine) => chaine.command(changerEn(PARAGRAPHE))] : [];
      }
      // Un élément de liste commence par un paragraphe : un titre ou un bloc code le redevient.
      return [
        (chaine) => chaine.command(changerEn(PARAGRAPHE)),
        (chaine) =>
          type.noeud === "bulletList" ? chaine.toggleBulletList() : chaine.toggleOrderedList(),
      ];
    case "titre":
    case "paragraphe":
      // Le bloc sort de toutes les listes qui l'entourent avant de changer de type.
      return [
        ...listes.map((): Etape => (chaine) => chaine.liftListItem(ELEMENT_DE_LISTE)),
        (chaine) =>
          chaine.command(
            type.forme === "titre" ? changerEn(TITRE, type.niveau) : changerEn(PARAGRAPHE),
          ),
      ];
  }
}

interface Composition {
  /** Les transactions de chaque étape, chacune partie de l'état que la précédente laisse. */
  readonly transactions: readonly Transaction[];
  readonly etatFinal: EditorState;
}

/**
 * L'état d'où part la composition : une sélection de nœud ou de tout le document y devient la
 * sélection du texte qu'elle couvre, que les commandes de liste savent lire ; le bloc changé, le
 * curseur reste dans son texte, où l'on tape aussitôt.
 */
function etatDeDepart(etat: EditorState): EditorState {
  const { $from, $to } = bornesLues(etat.selection);
  if ($from === etat.selection.$from && $to === etat.selection.$to) {
    return etat;
  }
  const selection = TextSelection.between($from, $to);
  return EditorState.create({ schema: etat.schema, doc: etat.doc, selection });
}

/**
 * Compose le type, après le retrait de l'étendue, sur des états successifs : chaque étape part
 * d'une transaction neuve, comme les commandes de ProseMirror le supposent (une commande qui
 * suivrait une autre dans la même transaction lirait des positions décalées), et rien n'est envoyé.
 * `undefined` si une étape est refusée : c'est le jugement à blanc de F-005-AC11.
 */
function composer(editeur: Editor, type: TypeDeBloc, retrait?: Retrait): Composition | undefined {
  let etat = etatDeDepart(editeur.state);
  const transactions: Transaction[] = [];
  const avancer = (etape: Etape): boolean => {
    const tr = etat.tr;
    const gestionnaire = new CommandManager({ editor: editeur, state: etat });
    if (!etape(gestionnaire.createChain(tr, true)).run()) {
      return false;
    }
    transactions.push(tr);
    // Un état sans greffons : `apply` passerait la transaction aux greffons de l'éditeur (filtre
    // et ajouts), dont l'élévation de version, qui écrit dans Yjs (F-005-AC20, AC25).
    etat = EditorState.create({ schema: tr.doc.type.schema, doc: tr.doc, selection: tr.selection });
    return true;
  };
  if (retrait !== undefined) {
    const retirer: Etape = (chaine) =>
      chaine.command(({ tr }) => {
        tr.delete(retrait.from, retrait.to);
        return true;
      });
    if (!avancer(retirer)) {
      return undefined;
    }
  }
  const etapes = etapesDuType(etat.selection.$from, type);
  return etapes.every(avancer) ? { transactions, etatFinal: etat } : undefined;
}

// Les jugements à blanc, par état de l'éditeur : un état ne change jamais, et la barre comme le
// menu jugent les sept commandes à chaque rendu ; chaque jugement crée plusieurs états.
const disponibilites = new WeakMap<EditorState, Map<string, boolean>>();

function cleDuJugement(type: TypeDeBloc, retrait: Retrait | undefined): string {
  const precision = type.forme === "titre" ? type.niveau : type.forme === "liste" ? type.noeud : "";
  return `${type.forme}:${precision}:${retrait?.from ?? ""}-${retrait?.to ?? ""}`;
}

/**
 * Vrai si le schéma permet de donner ce type au bloc courant, après le retrait de l'étendue : jugé
 * à blanc, sur des transactions jamais envoyées (F-005-AC11).
 */
export function typeDisponible(editeur: Editor, type: TypeDeBloc, retrait?: Retrait): boolean {
  const etat = editeur.state;
  const jugees = disponibilites.get(etat) ?? new Map<string, boolean>();
  disponibilites.set(etat, jugees);
  const cle = cleDuJugement(type, retrait);
  const connue = jugees.get(cle);
  if (connue !== undefined) {
    return connue;
  }
  const disponible = composer(editeur, type, retrait) !== undefined;
  jugees.set(cle, disponible);
  return disponible;
}

// Toute modification part dans une seule transaction de l'éditeur, sans transaction Yjs
// englobante : elle entre ainsi dans l'historique d'annulation de la liaison (H9), et une autre
// réplique ne voit jamais d'état intermédiaire (H10). Rien n'est envoyé pour une commande
// indisponible, jugée de nouveau sur l'état de cet instant (F-005-AC11, AC16).
export function donnerLeType(editeur: Editor, type: TypeDeBloc, retrait?: Retrait): boolean {
  const composition = composer(editeur, type, retrait);
  if (composition === undefined) {
    return false;
  }
  const tr = editeur.state.tr;
  composition.transactions.forEach((etape) => etape.steps.forEach((pas) => tr.step(pas)));
  tr.setSelection(Selection.fromJSON(tr.doc, composition.etatFinal.selection.toJSON()));
  editeur.view.dispatch(tr.scrollIntoView());
  return true;
}
