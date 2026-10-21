// Menu slash (F-005-AC12 à AC20, H9, H10) : l'utilitaire de suggestion de Tiptap repère le `/` et
// la séquence, intercepte les touches avant l'éditeur et suit le texte ; la liste affichée est un
// composant de l'application, et l'état du menu ne vit jamais dans le document de page (AC20).
import { shift } from "@floating-ui/dom";
import { type Editor, Extension } from "@tiptap/core";
import { type EditorState, Plugin, PluginKey, type Transaction } from "@tiptap/pm/state";
import {
  exitSuggestion,
  Suggestion,
  type SuggestionKeyDownProps,
  type SuggestionProps,
} from "@tiptap/suggestion";

import type { PositionDuMenu } from "../interface/composants/Edition.tsx";
import { BLOC_CODE, type CommandeDeType, LISTE_DES_COMMANDES } from "./commandes-de-bloc.ts";
import { commandesFiltrees } from "./filtre-des-commandes.ts";
import { estAppliqueeDepuisYjs } from "./liaison.ts";
import { donnerLeType, type Retrait, typeDisponible } from "./types-de-bloc.ts";

/** Ce que l'interface lit du menu ouvert, à chaque changement. */
export interface EtatDuMenu {
  /** Les commandes disponibles que le filtre garde, dans l'ordre de la liste. */
  readonly commandes: readonly CommandeDeType[];
  /** Rang de la commande active ; sans objet quand aucune commande n'est listée. */
  readonly active: number;
  /** Pose le menu près du curseur et le suit ; rend la fonction qui cesse de le suivre. */
  readonly monter: (
    element: HTMLElement,
    surPosition: (position: PositionDuMenu) => void,
  ) => () => void;
  /** Applique la commande de ce rang : clic sur une option. */
  readonly choisir: (rang: number) => void;
}

export interface OptionsDuMenu {
  /** Appelée à chaque changement du menu ; `undefined` : le menu est fermé. */
  readonly surChangement: (etat: EtatDuMenu | undefined) => void;
}

const CLE_DU_MENU = new PluginKey("menuSlash");
const DECLENCHEUR = "/";
const ESPACE = " ";
// Le menu reste entier dans la fenêtre en largeur, à cette distance de ses bords (AC34).
const MARGE_DANS_LA_FENETRE = 8;
// Au-dessus des raccourcis du noyau (Entrée) et du dépôt de F-006 (Alt+Maj+Flèches), comme la
// mention de Tiptap.
const PRIORITE_DU_MENU = 101;

interface EtatDeLaSuggestion {
  readonly active: boolean;
  readonly range: Retrait;
  readonly text: string | null;
}

function etatDeLaSuggestion(etat: EditorState): EtatDeLaSuggestion | undefined {
  return CLE_DU_MENU.getState(etat) as EtatDeLaSuggestion | undefined;
}

/** La séquence du menu ouvert, à sa place dans l'état courant ; `undefined` s'il est fermé. */
function sequenceOuverte(editeur: Editor): Retrait | undefined {
  const etat = etatDeLaSuggestion(editeur.state);
  return etat?.active === true ? etat.range : undefined;
}

/**
 * Le menu s'ouvre en tête d'un bloc de texte ou juste après une espace, jamais dans un bloc code
 * (AC12, AC13) : le caractère qui précède le `/` est relu dans le document, car l'utilitaire ne lit
 * que le nœud de texte du curseur (veille : un `/` après du gras l'ouvrirait).
 */
function menuPermis(etat: EditorState, debut: number): boolean {
  const $debut = etat.doc.resolve(debut);
  if ($debut.parent.type.name === BLOC_CODE) {
    return false;
  }
  return $debut.parentOffset === 0 || etat.doc.textBetween(debut - 1, debut) === ESPACE;
}

/** Les commandes que le schéma permet ici, une fois la séquence retirée (AC11, AC12). */
function commandesDisponibles(editeur: Editor): CommandeDeType[] {
  const sequence = sequenceOuverte(editeur);
  return LISTE_DES_COMMANDES.filter((commande) => typeDisponible(editeur, commande.type, sequence));
}

/**
 * Retire la séquence et donne le type en une seule transaction (AC16, H10), jugée de nouveau à cet
 * instant, à la place où la séquence se trouve maintenant (AC19) ; indisponible, le menu se ferme
 * et rien n'est modifié.
 */
function appliquer(editeur: Editor, commande: CommandeDeType | undefined): void {
  const sequence = sequenceOuverte(editeur);
  if (sequence === undefined) {
    return;
  }
  if (commande === undefined || !donnerLeType(editeur, commande.type, sequence)) {
    exitSuggestion(editeur.view, CLE_DU_MENU);
  }
}

const PAS_DES_FLECHES: Readonly<Record<string, number>> = { ArrowDown: 1, ArrowUp: -1 };

function memesCommandes(a: readonly CommandeDeType[], b: readonly CommandeDeType[]): boolean {
  return a.length === b.length && a.every((commande, rang) => commande === b[rang]);
}

interface ReponseALaTouche {
  /** Vrai : l'éditeur ne voit pas la touche. */
  readonly traitee: boolean;
  readonly active?: number;
  readonly choisie?: CommandeDeType | undefined;
}

/**
 * Flèche haut et Flèche bas parcourent la liste, en boucle, sans déplacer le curseur (AC15) ;
 * Entrée applique la commande active ; avec « Aucune commande », Entrée ne fait rien : ni coupure,
 * ni mise à jour, le menu reste ouvert et la séquence dans le texte (AC11, AC18, H16). Menu ouvert,
 * ces touches sont les siennes, avec ou sans modificateur : le module d'édition ne lit aucun
 * modificateur d'une frappe (F-004-AC31). Une frappe qui valide une composition (méthode de
 * saisie) reste à la composition.
 */
function reponseALaTouche(
  commandes: readonly CommandeDeType[],
  active: number,
  evenement: KeyboardEvent,
): ReponseALaTouche {
  if (evenement.isComposing) {
    return { traitee: false };
  }
  const pas = PAS_DES_FLECHES[evenement.key];
  if (pas !== undefined) {
    const nombre = commandes.length;
    return nombre > 0
      ? { traitee: true, active: (active + pas + nombre) % nombre }
      : { traitee: true };
  }
  if (evenement.key !== "Enter") {
    return { traitee: false };
  }
  return commandes.length === 0 ? { traitee: true } : { traitee: true, choisie: commandes[active] };
}

interface MenuOuvert {
  readonly props: SuggestionProps<CommandeDeType>;
  readonly commandes: readonly CommandeDeType[];
  readonly active: number;
}

function etatPourLInterface(editeur: Editor, { props, commandes, active }: MenuOuvert): EtatDuMenu {
  return {
    commandes,
    active,
    monter: (element, surPosition) =>
      props.mount(element, { onPosition: ({ x, y }) => surPosition({ gauche: x, haut: y }) }),
    choisir: (rang) => appliquer(editeur, commandes[rang]),
  };
}

/**
 * Le contrôleur d'un menu : ce qu'il liste, sa commande active, et ce qu'il dit à l'interface. La
 * liste est calculée à chaque changement de l'état, sans attendre les éléments que l'utilitaire
 * charge de façon asynchrone (veille du 2026-10-16) : Entrée applique toujours ce qui est affiché.
 */
function controleur(editeur: Editor, options: OptionsDuMenu) {
  let ouvert: MenuOuvert | undefined;
  const signaler = (): void =>
    options.surChangement(ouvert === undefined ? undefined : etatPourLInterface(editeur, ouvert));

  // Une liste nouvelle rend la première commande active (AC14) ; la même liste garde la sienne.
  const recevoir = (props: SuggestionProps<CommandeDeType>): void => {
    const commandes = commandesFiltrees(commandesDisponibles(editeur), props.query);
    const active =
      ouvert !== undefined && memesCommandes(ouvert.commandes, commandes) ? ouvert.active : 0;
    ouvert = { props, commandes, active };
    signaler();
  };

  const surTouche = ({ event }: SuggestionKeyDownProps): boolean => {
    if (ouvert === undefined) {
      return false;
    }
    const reponse = reponseALaTouche(ouvert.commandes, ouvert.active, event);
    if (reponse.active !== undefined) {
      ouvert = { ...ouvert, active: reponse.active };
      signaler();
    }
    if (reponse.choisie !== undefined) {
      appliquer(editeur, reponse.choisie);
    }
    return reponse.traitee;
  };

  return {
    onStart: recevoir,
    onUpdate: recevoir,
    onExit: (): void => {
      ouvert = undefined;
      signaler();
    },
    onKeyDown: surTouche,
  };
}

/**
 * Une mise à jour reçue qui modifie ou retire la séquence ferme le menu ; une insertion reçue
 * avant elle la laisse ouverte, à sa nouvelle place (AC19). L'utilitaire, lui, suivrait la séquence
 * modifiée (veille du 2026-10-16).
 */
function fermerSiLaSequenceRecueChange(
  transactions: readonly Transaction[],
  avant: EditorState,
  apres: EditorState,
): Transaction | null {
  if (!transactions.some(estAppliqueeDepuisYjs)) {
    return null;
  }
  const [ancien, nouveau] = [etatDeLaSuggestion(avant), etatDeLaSuggestion(apres)];
  if (ancien?.active !== true || nouveau?.active !== true) {
    return null;
  }
  // La liaison remplace tout le document à chaque mise à jour reçue : la séquence est jugée par son
  // texte et par le bloc qui la porte, qu'un changement de type reçu remplace.
  const [blocAvant, blocApres] = [
    avant.doc.resolve(ancien.range.from).parent,
    apres.doc.resolve(nouveau.range.from).parent,
  ];
  const touchee = nouveau.text !== ancien.text || !blocAvant.sameMarkup(blocApres);
  return touchee ? apres.tr.setMeta(CLE_DU_MENU, { exit: true }) : null;
}

export function menuSlash(options: OptionsDuMenu): Extension {
  return Extension.create({
    name: "menuSlash",
    priority: PRIORITE_DU_MENU,
    addProseMirrorPlugins() {
      const { editor } = this;
      return [
        Suggestion<CommandeDeType, CommandeDeType>({
          editor,
          pluginKey: CLE_DU_MENU,
          char: DECLENCHEUR,
          allowedPrefixes: [ESPACE],
          allow: ({ state, range }) => menuPermis(state, range.from),
          // La liste vient du contrôleur, calculée sur l'état courant, et il applique lui-même la
          // commande choisie : ni liste à charger ici, ni option `command`.
          items: () => [],
          render: () => controleur(editor, options),
          placement: "bottom-start",
          flip: true,
          floatingUi: {
            strategy: "fixed",
            middleware: [shift({ padding: MARGE_DANS_LA_FENETRE })],
          },
        }),
        new Plugin({
          key: new PluginKey("menuSlashSuitLesMisesAJourRecues"),
          appendTransaction: fermerSiLaSequenceRecueChange,
        }),
      ];
    },
    // Le focus qui quitte l'éditeur ferme le menu, qui n'aurait plus de clavier (AC17).
    onBlur() {
      if (sequenceOuverte(this.editor) !== undefined) {
        exitSuggestion(this.editor.view, CLE_DU_MENU);
      }
    },
  });
}
