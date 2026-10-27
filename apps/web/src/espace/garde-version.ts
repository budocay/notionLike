// Garde de version du document d'espace (F-002-AC17, F-030-AC10) : ce que la façade de
// @notionlike/document refuse de lire est d'une version de format non prise en charge.
import {
  type Arborescence,
  type DocumentEspace,
  ErreurDocument,
  ouvrirDocumentEspace,
} from "@notionlike/document";

/** `undefined` : la façade refuse la version du document. */
export function lectureAdmise(facade: DocumentEspace): Arborescence | undefined {
  try {
    return facade.lire();
  } catch (erreur) {
    if (erreur instanceof ErreurDocument && erreur.code === "version-non-prise-en-charge") {
      return undefined;
    }
    throw erreur;
  }
}

/** Ce que la lecture d'un témoin dit : sa version refusée, ou son arborescence si elle se lit. */
type Jugement =
  | { readonly sorte: "refuse" }
  | { readonly sorte: "admis"; readonly arborescence: Arborescence | undefined };

// La façade d'un témoin ne vit que le temps de cette lecture. Seul le refus de version est un
// refus ; un témoin illisible pour une autre raison est admis, sans arborescence.
function juger(temoin: DocumentEspace["doc"]): Jugement {
  const facade = ouvrirDocumentEspace(temoin);
  try {
    const arborescence = lectureAdmise(facade);
    return arborescence === undefined ? { sorte: "refuse" } : { sorte: "admis", arborescence };
  } catch {
    return { sorte: "admis", arborescence: undefined };
  } finally {
    facade.fermer();
  }
}

/**
 * Juge un document témoin, que rien n'affiche : sa façade ne vit que le temps de cette lecture.
 * Seul le refus de version est un refus ; un témoin illisible pour une autre raison est admis, et
 * le document de la session dira lui-même ce qu'il a.
 */
export function estDUneVersionAdmise(temoin: DocumentEspace["doc"]): boolean {
  return juger(temoin).sorte === "admis";
}

/**
 * L'arborescence d'un témoin, lue de même (F-032-AC20, repli sans énumération) ; `undefined` si sa
 * version est refusée ou s'il ne se lit pas.
 */
export function arborescenceDuTemoin(temoin: DocumentEspace["doc"]): Arborescence | undefined {
  const jugement = juger(temoin);
  return jugement.sorte === "admis" ? jugement.arborescence : undefined;
}
