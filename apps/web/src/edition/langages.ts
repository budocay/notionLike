// Liste fermée des langages du bloc code (F-005 H5) et seule règle qui admet une valeur. Le format
// accepte toute chaîne dans `language` ; l'application ne propose, n'écrit et ne rend que ces
// identifiants (F-005-AC9, AC35, ADR-0018). Aucun import : donnée pure.
export const LANGAGES = [
  "bash",
  "css",
  "html",
  "javascript",
  "json",
  "markdown",
  "python",
  "sql",
  "typescript",
  "yaml",
] as const;

export type Langage = (typeof LANGAGES)[number];

/** L'identifiant de la liste que cette valeur est ; `null` pour toute autre valeur. */
export function langageAdmis(valeur: unknown): Langage | null {
  return LANGAGES.find((langage) => langage === valeur) ?? null;
}
