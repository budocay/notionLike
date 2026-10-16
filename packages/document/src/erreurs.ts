export type CodeErreurDocument =
  | "page-introuvable"
  | "page-a-la-corbeille"
  | "deplacement-cyclique"
  | "titre-trop-long"
  | "position-invalide"
  | "version-non-prise-en-charge"
  | "facade-fermee"
  | "version-invalide"
  | "rang-indisponible"
  | "page-hors-corbeille"
  // F-017 : refus du document de table (ADR-0016).
  | "pas-un-document-de-table"
  | "type-de-colonne-inconnu"
  | "nom-non-admis"
  | "libelle-non-admis"
  | "ligne-introuvable"
  | "colonne-introuvable"
  | "colonne-sans-options"
  | "option-introuvable"
  | "valeur-non-conforme";

export class ErreurDocument extends Error {
  readonly code: CodeErreurDocument;

  constructor(code: CodeErreurDocument, message: string) {
    super(message);
    this.name = "ErreurDocument";
    this.code = code;
  }
}
