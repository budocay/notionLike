// Menu slash (F-005-AC12 à AC20, H9, H10) : l'utilitaire de suggestion de Tiptap repère le `/` et
// la séquence, intercepte les touches avant l'éditeur et suit le texte ; la liste affichée est un
// composant de l'application, et l'état du menu ne vit jamais dans le document de page (AC20).
import { shift } from "@floating-ui/dom";
import { type Editor, Extension } from "@tiptap/core";
import { type EditorState, Plugin, PluginKey, type Transaction } from "@tiptap/pm/state";
import { type RefObject, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import {
  exitSuggestion,
  Suggestion,
  type SuggestionKeyDownProps,
  type SuggestionProps,
} from "@tiptap/suggestion";

import { commandesFiltrees } from "./filtre-des-commandes.ts";
import { estAppliqueeDepuisYjs } from "./marques.ts";
import {
  BLOC_CODE,
  type CommandeDeType,
  donnerLeType,
  LISTE_DES_COMMANDES,
  type Retrait,
  typeDisponible,
} from "./types-de-bloc.ts";

/** Coin haut gauche du menu, en pixels depuis celui de la fenêtre. */
export interface PositionDuMenu {
  readonly x: number;
  readonly y: number;
}

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
export function menuPermis(etat: EditorState, debut: number): boolean {
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
 * Entrée applique la commande active ; avec « Aucune commande », Entrée revient à l'éditeur et la
 * séquence reste (AC18). Menu ouvert, ces touches sont les siennes, avec ou sans modificateur : le
 * module d'édition ne lit aucun modificateur d'une frappe (F-004-AC31).
 */
function reponseALaTouche(
  commandes: readonly CommandeDeType[],
  active: number,
  evenement: KeyboardEvent,
): ReponseALaTouche {
  const pas = PAS_DES_FLECHES[evenement.key];
  if (pas !== undefined) {
    const nombre = commandes.length;
    return nombre > 0
      ? { traitee: true, active: (active + pas + nombre) % nombre }
      : { traitee: true };
  }
  if (evenement.key !== "Enter" || commandes.length === 0) {
    return { traitee: false };
  }
  return { traitee: true, choisie: commandes[active] };
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
      props.mount(element, { onPosition: ({ x, y }) => surPosition({ x, y }) }),
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
          // La liste vient du contrôleur, calculée sur l'état courant : rien à charger ici.
          items: () => [],
          command: ({ props }) => appliquer(editor, props),
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

// ——— Côté interface : position, désignation par l'éditeur ———

/** Ce que la zone d'édition lit du menu pour le rendre. */
export interface MenuAffiche {
  readonly etat: EtatDuMenu | undefined;
  /** `undefined` tant que la bibliothèque de positionnement ne l'a pas mesuré. */
  readonly position: PositionDuMenu | undefined;
  readonly ref: RefObject<HTMLDivElement | null>;
  readonly idDeLaListe: string;
  readonly idDeLOption: (rang: number) => string;
}

/**
 * Pose le menu ouvert près du curseur, une fois par ouverture : la bibliothèque le suit ensuite
 * (défilement, redimensionnement) et ne fait que donner ses coordonnées, que l'interface pose.
 */
function usePosition(
  etat: EtatDuMenu | undefined,
  ref: RefObject<HTMLDivElement | null>,
): PositionDuMenu | undefined {
  const [position, setPosition] = useState<PositionDuMenu | undefined>(undefined);
  const dernier = useRef(etat);
  useLayoutEffect(() => {
    dernier.current = etat;
  });
  const ouvert = etat !== undefined;
  useLayoutEffect(() => {
    const [element, courant] = [ref.current, dernier.current];
    if (!ouvert || element === null || courant === undefined) {
      setPosition(undefined);
      return undefined;
    }
    return courant.monter(element, setPosition);
  }, [ouvert, ref]);
  return position;
}

/**
 * Tant que le menu est ouvert, l'éditeur garde le focus et désigne la liste et la commande active
 * (`aria-controls`, `aria-activedescendant`), retirées à la fermeture (F-005-AC22, H12).
 */
function useDesignation(
  editeur: Editor | null,
  etat: EtatDuMenu | undefined,
  idDeLaListe: string,
): void {
  const active =
    etat === undefined || etat.commandes.length === 0 ? undefined : `${idDeLaListe}-${etat.active}`;
  const ouvert = etat !== undefined;
  useEffect(() => {
    if (editeur === null || editeur.isDestroyed) {
      return undefined;
    }
    const element = editeur.view.dom;
    const poser = (nom: string, valeur: string | undefined): void => {
      if (valeur === undefined) {
        element.removeAttribute(nom);
      } else {
        element.setAttribute(nom, valeur);
      }
    };
    poser("aria-controls", ouvert ? idDeLaListe : undefined);
    poser("aria-activedescendant", active);
    return () => {
      poser("aria-controls", undefined);
      poser("aria-activedescendant", undefined);
    };
  }, [editeur, ouvert, active, idDeLaListe]);
}

export function useMenuAffiche(editeur: Editor | null, etat: EtatDuMenu | undefined): MenuAffiche {
  const ref = useRef<HTMLDivElement>(null);
  const idDeLaListe = useId();
  const position = usePosition(etat, ref);
  useDesignation(editeur, etat, idDeLaListe);
  return {
    etat,
    position,
    ref,
    idDeLaListe,
    idDeLOption: (rang) => `${idDeLaListe}-${rang}`,
  };
}
