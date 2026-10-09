export interface VariableExemple {
  readonly cle: string;
  readonly valeur: string;
  /** Ligne qui précède la variable si c'est un commentaire, sinon chaîne vide. */
  readonly commentaire: string;
}

const AFFECTATION = /^([A-Z][A-Z0-9_]*)=(.*)$/;
const NOM_DE_SECRET = /PASSWORD|SECRET|URL_BASE_DONNEES/;
const MARQUE = "factice";

/** Lit un fichier d'exemple : la valeur d'une clé est ce qui suit le premier `=` de sa ligne. */
export function lireExemple(texte: string): VariableExemple[] {
  const lignes = texte.split("\n");
  return lignes.flatMap((ligne, rang) => {
    const affectation = AFFECTATION.exec(ligne);
    if (affectation === null) return [];
    const [, cle = "", valeur = ""] = affectation;
    const precedente = lignes[rang - 1] ?? "";
    return [{ cle, valeur, commentaire: precedente.startsWith("#") ? precedente : "" }];
  });
}

/**
 * F-008-AC13 : tout secret d'un fichier d'exemple est une valeur factice, marquée comme telle par la
 * ligne de commentaire qui la précède. Les constats ne recopient jamais la valeur lue.
 */
export function constatsValeursFactices(variables: readonly VariableExemple[]): string[] {
  return variables
    .filter(({ cle }) => NOM_DE_SECRET.test(cle))
    .flatMap(({ cle, valeur, commentaire }) => [
      ...(valeur.includes(MARQUE) ? [] : [`${cle} : la valeur n'est pas factice`]),
      ...(commentaire.includes(MARQUE) ? [] : [`${cle} : aucun commentaire ne la dit factice`]),
    ]);
}

function valeurDe(variables: readonly VariableExemple[], cle: string): string | undefined {
  return variables.find((variable) => variable.cle === cle)?.valeur;
}

function motDePasseDeLUrl(url: string | undefined): string | undefined {
  return url !== undefined && URL.canParse(url) ? new URL(url).password : undefined;
}

/**
 * F-008-AC14 : le mot de passe factice d'infra/.env.example est celui de l'URL factice
 * d'apps/server/.env.example, que le serveur refuse en production.
 */
export function constatsAccordDesExemples(
  infra: readonly VariableExemple[],
  serveur: readonly VariableExemple[],
): string[] {
  const motDePasse = valeurDe(infra, "POSTGRES_PASSWORD");
  const attendu = motDePasseDeLUrl(valeurDe(serveur, "URL_BASE_DONNEES"));
  if (motDePasse === undefined) return ["infra/.env.example : POSTGRES_PASSWORD absent"];
  if (attendu === undefined) return ["apps/server/.env.example : URL_BASE_DONNEES illisible"];
  return motDePasse === attendu ? [] : ["les deux mots de passe factices diffèrent"];
}
