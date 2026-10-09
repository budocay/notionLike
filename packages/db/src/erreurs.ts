// Erreurs typées de l'accès à la base (ADR-0005). Le message est une phrase fixe par code :
// il ne porte ni l'URL de connexion, ni le mot de passe, ni le message du pilote.
export type CodeErreurBase = "url-de-connexion-invalide" | "base-injoignable" | "sonde-hors-delai";

const MESSAGES: Readonly<Record<CodeErreurBase, string>> = {
  "url-de-connexion-invalide": "L'URL de connexion à la base est invalide.",
  "base-injoignable": "La base est injoignable.",
  "sonde-hors-delai": "La base n'a pas répondu à la sonde dans le délai imposé.",
};

export class ErreurBase extends Error {
  readonly code: CodeErreurBase;

  constructor(code: CodeErreurBase, options?: ErrorOptions) {
    super(MESSAGES[code], options);
    this.name = "ErreurBase";
    this.code = code;
  }
}
