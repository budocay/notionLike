export type { Arborescence, IdPage, PageLue, TypeDePage } from "./arbre.ts";
export {
  creerDocumentEspace,
  type DocumentEspace,
  type Emplacement,
  ouvrirDocumentEspace,
} from "./document-espace.ts";
export { type DocumentPage, lireVersionPage, ouvrirDocumentPage } from "./document-page.ts";
export { creerDocumentTable, type DocumentTable, ouvrirDocumentTable } from "./document-table.ts";
export { type CodeErreurDocument, ErreurDocument } from "./erreurs.ts";
export {
  type LigneDeVersionPage,
  TABLE_DES_VERSIONS_PAGE,
  VERSION_PAGE_PRISE_EN_CHARGE,
} from "./format-page.ts";
export type {
  ColonneLue,
  IdColonne,
  IdLigne,
  IdOption,
  LigneLue,
  OptionLue,
  TableLue,
  TypeDeColonne,
  ValeurDeCellule,
} from "./table.ts";
