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

/**
 * Juge un document témoin, que rien n'affiche : sa façade ne vit que le temps de cette lecture.
 * Seul le refus de version est un refus ; un témoin illisible pour une autre raison est admis, et
 * le document de la session dira lui-même ce qu'il a.
 */
export function estDUneVersionAdmise(temoin: DocumentEspace["doc"]): boolean {
  const facade = ouvrirDocumentEspace(temoin);
  try {
    return lectureAdmise(facade) !== undefined;
  } catch {
    return true;
  } finally {
    facade.fermer();
  }
}
