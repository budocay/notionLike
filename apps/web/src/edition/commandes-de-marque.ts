// Les commandes de mise en forme de la barre de blocs et du panneau de lien (F-028-AC1, AC4, AC6,
// AC7, AC17). Toute modification part par les commandes de l'éditeur, sans transaction englobante :
// elle entre ainsi dans l'historique d'annulation de la liaison (F-028-AC21, H3).
import type { Editor } from "@tiptap/core";

import { adresseAcceptee, adresseDUneSaisie } from "./adresses.ts";
import { NOM_DE_LA_MARQUE_DE_LIEN } from "./lien.ts";
import { lienCourant, selectionDansUnBloc } from "./marques.ts";

export interface EtatDuLien {
  /** Faux : la commande « Lien » est indisponible, et Mod+K n'ouvre rien. */
  readonly disponible: boolean;
  /** Vrai : le texte où se trouve le curseur porte un lien, neutralisé ou non. */
  readonly actif: boolean;
  /** L'adresse enregistrée du lien visé, montrée comme du texte ; vide hors d'un lien. */
  readonly adresse: string;
  /** La forme normalisée d'une adresse acceptée : « Ouvrir le lien » ; indisponible sinon. */
  readonly ouvrable: string | undefined;
  readonly retirable: boolean;
}

export interface EtatDesMarques {
  readonly gras: boolean;
  readonly italique: boolean;
  readonly lien: EtatDuLien;
}

interface Etendue {
  readonly from: number;
  readonly to: number;
}

const GRAS = "bold";
const ITALIQUE = "italic";

function lienVise(editeur: Editor): Etendue | undefined {
  const { empty, from, to } = editeur.state.selection;
  const lien = lienCourant(editeur.state);
  if (empty) {
    return lien === undefined ? undefined : { from: lien.de, to: lien.a };
  }
  return selectionDansUnBloc(editeur.state) ? { from, to } : undefined;
}

export function etatDesMarques(editeur: Editor): EtatDesMarques {
  const { state } = editeur;
  const lien = lienCourant(state);
  const enregistree: unknown = lien?.adresse;
  const actif = lien !== undefined || editeur.isActive(NOM_DE_LA_MARQUE_DE_LIEN);
  return {
    gras: editeur.isActive(GRAS),
    italique: editeur.isActive(ITALIQUE),
    lien: {
      disponible: editeur.isEditable && lienVise(editeur) !== undefined,
      actif,
      adresse: typeof enregistree === "string" ? enregistree : "",
      ouvrable: adresseAcceptee(enregistree),
      retirable: actif,
    },
  };
}

export function basculerLeGras(editeur: Editor): void {
  editeur.chain().toggleBold().run();
}

export function basculerLItalique(editeur: Editor): void {
  editeur.chain().toggleItalic().run();
}

/** Ce que Mod+K fait ici (F-028-AC6, H12). */
export type EffetDuRaccourciDeLien =
  /** Le panneau de lien s'ouvre. */
  | "panneau"
  /** La combinaison est à cette feature, mais rien n'est à lier : sélection sur plusieurs blocs. */
  | "rien"
  /** Sélection vide hors d'un lien : la combinaison est à la palette de F-024. */
  | "palette";

export function effetDuRaccourciDeLien(editeur: Editor): EffetDuRaccourciDeLien {
  if (etatDesMarques(editeur).lien.disponible) {
    return "panneau";
  }
  return editeur.state.selection.empty ? "palette" : "rien";
}

// La sélection est rendue telle qu'elle était : seul le lien change (F-028-AC27).
function surLEtendue(editeur: Editor, etendue: Etendue, appliquer: () => void): void {
  const { from, to } = editeur.state.selection;
  editeur.commands.setTextSelection(etendue);
  appliquer();
  editeur.commands.setTextSelection({ from, to });
}

/**
 * Pose le lien de cette saisie sur la sélection, ou sur toute l'étendue du lien où se trouve le
 * curseur ; faux, sans rien écrire, si son adresse est refusée (F-028-AC8, AC12).
 */
export function poserLeLien(editeur: Editor, saisie: string): boolean {
  const adresse = adresseDUneSaisie(saisie);
  const etendue = lienVise(editeur);
  if (adresse === undefined || etendue === undefined) {
    return false;
  }
  let pose = false;
  surLEtendue(editeur, etendue, () => {
    pose = editeur.commands.setLink({ href: adresse });
  });
  return pose;
}

/** Retire le lien en conservant le texte et ses autres marques (F-028-AC7). */
export function retirerLeLien(editeur: Editor): void {
  const etendue = lienVise(editeur);
  if (etendue !== undefined) {
    surLEtendue(editeur, etendue, () => editeur.commands.unsetLink());
  }
}
