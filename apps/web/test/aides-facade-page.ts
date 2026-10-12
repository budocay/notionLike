// Seul fichier de test d'apps/web qui ouvre une façade de document de page (F-003-AC35). Chaque
// façade ouverte ici est suivie et fermée en fin de test ; la preuve de la fermeture est le nombre
// d'écouteurs et d'observateurs de chaque `Y.Doc` revenu à sa valeur de départ.
import { type DocumentPage, ouvrirDocumentPage } from "@notionlike/document";
import { afterEach, expect } from "vitest";
import type * as Y from "yjs";

const departsDesPages = new Map<Y.Doc, number>();
const pagesOuvertes: DocumentPage[] = [];

/** Écouteurs du document et observateurs, simples et profonds, de chacun de ses types racine. */
export function observateursDuDocument(doc: Y.Doc): number {
  let compte = 0;
  doc._observers.forEach((ecouteurs) => {
    compte += ecouteurs.size;
  });
  doc.share.forEach((type) => {
    compte += type._eH.l.length + type._dEH.l.length;
  });
  return compte;
}

/** Note le compte de départ d'un document, avant tout ce qu'un test y pose. */
export function suivreLeDocument(doc: Y.Doc): void {
  if (!departsDesPages.has(doc)) {
    departsDesPages.set(doc, observateursDuDocument(doc));
  }
}

export function ouvrirFacadeDePage(doc: Y.Doc): DocumentPage {
  suivreLeDocument(doc);
  const page = ouvrirDocumentPage(doc);
  pagesOuvertes.push(page);
  return page;
}

/** Observateurs que les documents suivis portent en plus de leur compte de départ. */
export function observateursRestants(): number {
  let restants = 0;
  for (const [doc, depart] of departsDesPages) {
    restants += Math.max(0, observateursDuDocument(doc) - depart);
  }
  return restants;
}

/** Ferme les façades de page ouvertes par cette aide, et rend ce qui reste observé malgré cela. */
export function fermerLesFacadesDePage(): number {
  pagesOuvertes.splice(0).forEach((page) => page.fermer());
  const restants = observateursRestants();
  departsDesPages.clear();
  return restants;
}

afterEach(() => {
  expect(fermerLesFacadesDePage()).toBe(0);
});
