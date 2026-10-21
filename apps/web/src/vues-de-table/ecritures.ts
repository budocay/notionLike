// Écriture dans le document de table (F-018-AC37) : une opération de la façade, et le message en
// français de son refus typé. Toute autre exception est un défaut et remonte.
import { type CodeErreurDocument, ErreurDocument } from "@notionlike/document";

import { messageErreur } from "../interface/messages.ts";
import { DATE_INVALIDE } from "./textes.ts";

export type Issue<T> =
  | { readonly reussie: true; readonly valeur: T }
  | { readonly reussie: false; readonly code: CodeErreurDocument; readonly message: string };

/** Fait l'opération ; un refus du document devient son message, sans code technique (AC37). */
export function ecrire<T>(operation: () => T): Issue<T> {
  try {
    return { reussie: true, valeur: operation() };
  } catch (erreur) {
    if (erreur instanceof ErreurDocument) {
      return { reussie: false, code: erreur.code, message: messageErreur(erreur.code) };
    }
    throw erreur;
  }
}

/** Le message d'une date refusée par le document : celui que F-018-AC30 prescrit. */
export function messageDeLaDate(issue: Issue<unknown>): string | undefined {
  if (issue.reussie) {
    return undefined;
  }
  return issue.code === "valeur-non-conforme" ? DATE_INVALIDE : issue.message;
}
