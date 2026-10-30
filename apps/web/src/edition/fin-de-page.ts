// Zone et ligne de fin de page (F-040, H1 option b) : rendues par la vue, hors du document. Rien
// n'est écrit à l'ouverture ni au focus ; un paragraphe n'est ajouté qu'à un geste de la personne
// (clic ou toucher dans la zone, Entrée trois fois en fin de bloc code), en une seule transaction.
import type { Editor } from "@tiptap/core";
import { Selection, type Transaction } from "@tiptap/pm/state";
import { useEffect, useState } from "react";

import {
  PARAGRAPHE_AJOUTE_APRES_LE_CODE,
  PARAGRAPHE_AJOUTE_EN_FIN_DE_PAGE,
} from "../interface/messages.ts";

/** Clé de métadonnée d'une transaction qui a ajouté un paragraphe de fin : ce qu'il suit. */
export const PARAGRAPHE_DE_FIN = "paragrapheDeFin";
export type SuiteDe = "code" | "page";

const PARAGRAPHE = "paragraph";

/** Vrai si le dernier bloc de premier niveau existe et n'est pas un paragraphe. */
function dernierBlocHorsParagraphe(editeur: Editor): boolean {
  const dernier = editeur.state.doc.lastChild;
  return dernier !== null && dernier.type.name !== PARAGRAPHE;
}

/**
 * Vrai tant que la ligne de fin se rend : éditeur modifiable ou non (la zone seule est retirée en
 * lecture seule), à chaque transaction, y compris celles que Yjs reçoit.
 */
export function useLigneDeFin(editeur: Editor | null): boolean {
  const [ligne, setLigne] = useState(false);
  useEffect(() => {
    if (editeur === null || editeur.isDestroyed) {
      setLigne(false);
      return undefined;
    }
    const lire = (): void => setLigne(dernierBlocHorsParagraphe(editeur));
    lire();
    editeur.on("transaction", lire);
    return () => void editeur.off("transaction", lire);
  }, [editeur]);
  return ligne;
}

/**
 * Clic ou toucher dans la zone : un paragraphe vide après le dernier bloc de premier niveau, curseur
 * dedans ; si le dernier bloc en est un, le curseur va à sa fin, sans rien écrire (F-040-AC2).
 */
export function activerLaFinDePage(editeur: Editor): boolean {
  const paragraphe = editeur.schema.nodes[PARAGRAPHE];
  const dernier = editeur.state.doc.lastChild;
  if (!editeur.isEditable || editeur.isDestroyed || paragraphe === undefined || dernier === null) {
    return false;
  }
  const { state, view } = editeur;
  const tr = state.tr;
  if (dernier.type.name !== PARAGRAPHE) {
    const suite: SuiteDe = dernier.type.spec.code === true ? "code" : "page";
    tr.insert(state.doc.content.size, paragraphe.createAndFill() ?? paragraphe.create());
    tr.setMeta(PARAGRAPHE_DE_FIN, suite);
  }
  view.dispatch(tr.setSelection(Selection.atEnd(tr.doc)).scrollIntoView());
  view.focus();
  return true;
}

/** Le texte à annoncer pour cette transaction, ou `undefined` si elle n'a rien ajouté (F-040-AC9). */
export function annonceDeFin(transaction: Transaction): string | undefined {
  const suite: unknown = transaction.getMeta(PARAGRAPHE_DE_FIN);
  if (suite === "code") {
    return PARAGRAPHE_AJOUTE_APRES_LE_CODE;
  }
  return suite === "page" ? PARAGRAPHE_AJOUTE_EN_FIN_DE_PAGE : undefined;
}
