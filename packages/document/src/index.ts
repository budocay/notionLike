export type { Arborescence, IdPage, PageLue } from "./arbre.ts";
export {
  creerDocumentEspace,
  type DocumentEspace,
  type Emplacement,
  ouvrirDocumentEspace,
} from "./document-espace.ts";
export {
  type DocumentPage,
  eleverVersionPage,
  lireVersionPage,
  ouvrirDocumentPage,
} from "./document-page.ts";
export { type CodeErreurDocument, ErreurDocument } from "./erreurs.ts";
export {
  type LigneDeVersionPage,
  TABLE_DES_VERSIONS_PAGE,
  VERSION_PAGE_PRISE_EN_CHARGE,
} from "./format-page.ts";
