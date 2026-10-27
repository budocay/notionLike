// Écriture dans le document de table (F-018-AC37) : une opération de la façade, et le message en
// français de son refus typé. Toute autre exception est un défaut et remonte.
import { type CodeErreurDocument, ErreurDocument, type IdLigne } from "@notionlike/document";

import { messageErreur } from "../interface/messages.ts";
import { DATE_INVALIDE } from "./textes.ts";

export type Issue<T> =
  | { readonly reussie: true; readonly valeur: T }
  | { readonly reussie: false; readonly code: CodeErreurDocument; readonly message: string };

/**
 * Ce que le calcul des lignes affichées doit savoir des écritures de l'onglet (F-019-AC17) : une
 * mise à jour reçue n'y passe pas. `avant` précède une écriture de cellule ou une création de ligne
 * et rend de quoi défaire ce qu'elle a fait si le document la refuse ; `creee` et `deplacee` suivent
 * une création et un déplacement réussis, `voisine` étant la ligne affichée dont `ligne` prend la place.
 */
export interface Surveillance {
  readonly avant: () => () => void;
  readonly creee: (ligne: IdLigne) => void;
  readonly deplacee: (ligne: IdLigne, voisine: IdLigne) => void;
}

const RIEN = (): void => undefined;
export const SANS_SURVEILLANCE: Surveillance = { avant: () => RIEN, creee: RIEN, deplacee: RIEN };

/**
 * Fait l'opération ; un refus du document devient son message, sans code technique (AC37). Toute
 * écriture de cellule et toute création de ligne de l'onglet passe ici avec la `surveillance` de la
 * vue : un refus, typé ou non, défait ce que `avant` a préparé.
 */
export function ecrire<T>(operation: () => T, surveillance?: Surveillance): Issue<T> {
  const defaire = surveillance?.avant();
  try {
    return { reussie: true, valeur: operation() };
  } catch (erreur) {
    defaire?.();
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
