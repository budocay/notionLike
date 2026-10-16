// Règle des adresses (F-028-AC11, H4) : la seule fonction qui accepte ou refuse l'adresse d'un lien,
// à l'écriture comme au rendu. Ni DOM ni réseau : l'analyseur d'adresses de la plateforme, celui que
// le navigateur appliquera à l'ouverture, décide ; ce qu'on valide est ce qui sera ouvert. La liste
// de schémas de l'extension de lien n'en tient jamais lieu (F-028-AC32).

/** Borne arbitraire, facile à relever (H4). */
export const LONGUEUR_MAX_D_UNE_ADRESSE = 2048;

const SCHEMA_SECURISE = "https:";
const SCHEMAS_AVEC_HOTE = new Set([SCHEMA_SECURISE, "http:"]);
const SCHEMA_DE_COURRIEL = "mailto:";
// Le préfixe d'une saisie sans schéma (F-028-AC8) est composé du schéma et du début de l'autorité :
// ce n'est pas une adresse, et aucune adresse n'est écrite en dur dans les sources (F-004-AC21,
// F-010-AC20).
const DEBUT_DE_L_AUTORITE = "//";
const PREFIXES_D_UNE_SAISIE = {
  courriel: SCHEMA_DE_COURRIEL,
  web: `${SCHEMA_SECURISE}${DEBUT_DE_L_AUTORITE}`,
} as const;

function analyser(adresse: string): URL | undefined {
  try {
    return new URL(adresse);
  } catch {
    return undefined;
  }
}

function estAdmise(analysee: URL): boolean {
  if (analysee.protocol === SCHEMA_DE_COURRIEL) {
    return true;
  }
  return (
    SCHEMAS_AVEC_HOTE.has(analysee.protocol) &&
    analysee.hostname !== "" &&
    analysee.username === "" &&
    analysee.password === ""
  );
}

/**
 * La forme normalisée d'une adresse acceptée, seule forme jamais inscrite dans le document ;
 * `undefined` pour une adresse refusée. La forme normalisée est elle-même bornée : relue par cette
 * règle, elle est acceptée telle quelle.
 */
export function adresseAcceptee(valeur: unknown): string | undefined {
  if (typeof valeur !== "string" || valeur.length > LONGUEUR_MAX_D_UNE_ADRESSE) {
    return undefined;
  }
  const analysee = analyser(valeur);
  if (analysee === undefined || !estAdmise(analysee)) {
    return undefined;
  }
  return analysee.href.length > LONGUEUR_MAX_D_UNE_ADRESSE ? undefined : analysee.href;
}

/** Vrai pour la forme normalisée d'une adresse acceptée, et pour elle seule. */
export function estUneAdresseNormalisee(valeur: unknown): valeur is string {
  return typeof valeur === "string" && adresseAcceptee(valeur) === valeur;
}

/** Vrai pour une adresse acceptée de schéma `https` ou `http` (collage sur une sélection). */
export function estUneAdresseWeb(adresse: string): boolean {
  return SCHEMAS_AVEC_HOTE.has(analyser(adresse)?.protocol ?? "");
}

// Une saisie a un schéma si un `:` précède le premier `/`, `?` ou `#` (F-028-AC8).
function aUnSchema(saisie: string): boolean {
  const fin = saisie.search(/[/?#]/);
  const tete = fin < 0 ? saisie : saisie.slice(0, fin);
  return tete.includes(":");
}

function completer(brute: string): string | undefined {
  const saisie = brute.trim();
  if (saisie === "" || /^[/?#]/.test(saisie)) {
    return undefined;
  }
  if (aUnSchema(saisie)) {
    return saisie;
  }
  const courriel = saisie.split("@").length === 2 && !saisie.includes("/");
  return `${courriel ? PREFIXES_D_UNE_SAISIE.courriel : PREFIXES_D_UNE_SAISIE.web}${saisie}`;
}

/**
 * Ce que le panneau de lien inscrit pour une saisie (F-028-AC8) : une saisie sans schéma reçoit
 * le préfixe `mailto:` ou celui du schéma `https`, puis passe par la règle des adresses ; `undefined` :
 * refusée.
 */
export function adresseDUneSaisie(saisie: string): string | undefined {
  const complete = completer(saisie);
  return complete === undefined ? undefined : adresseAcceptee(complete);
}
