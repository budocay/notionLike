export type CodeErreurDocument =
  | "page-introuvable"
  | "page-a-la-corbeille"
  | "deplacement-cyclique"
  | "titre-trop-long"
  | "position-invalide"
  | "version-non-prise-en-charge"
  | "facade-fermee"
  | "version-invalide";

export class ErreurDocument extends Error {
  readonly code: CodeErreurDocument;

  constructor(code: CodeErreurDocument, message: string) {
    super(message);
    this.name = "ErreurDocument";
    this.code = code;
  }
}
