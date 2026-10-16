// Configuration du serveur (ADR-0004) : les variables d'environnement sont validées une fois, par
// un schéma, avant toute écoute. Une erreur nomme les variables fautives et la raison de chaque
// refus (F-031-AC12), jamais leur valeur. Lu aussi par l'entrée de vérification (ADR-0017) : ce
// fichier n'importe que zod, ni base, ni réseau, ni module de Node.
import { z } from "zod";

export const MOT_DE_PASSE_FACTICE = "factice-a-remplacer";
export const SECRET_FACTICE = "factice-a-remplacer-par-trente-deux-caracteres-aleatoires";

const PORT_MAX = 65_535;
const PROTOCOLES_POSTGRES = ["postgres:", "postgresql:"];
const PROTOCOLES_PUBLICS = ["http:", "https:"];
const SEPARATEUR_DES_ORIGINES = ",";
const LONGUEUR_MIN_DU_SECRET = 32;

export interface Configuration {
  readonly hote: string;
  readonly port: number;
  readonly urlBaseDonnees: string;
  readonly originesAutorisees: readonly string[];
  // Secret de signature des cookies de session (F-009-AC18).
  readonly secretDesSessions: string;
  // Origine publique du serveur : better-auth n'en déduit aucune des en-têtes (F-009-AC30).
  readonly urlPublique: string;
  // F-009-AC9 : réglé ici, jamais laissé à la déduction de better-auth.
  readonly cookiesSecurises: boolean;
  readonly proxysDeConfiance: number;
}

export type Environnement = Readonly<Record<string, string | undefined>>;

// F-031-AC12 : la liste fermée des raisons d'un refus. Aucune n'est tirée d'une valeur (AC13).
export const RAISONS = {
  absente: "absente",
  factice: "valeur factice de l'exemple, refusée en production",
  tropCourte: "trop courte : 32 caractères au moins",
  urlMalFormee: "URL mal formée",
  protocolePostgres: "protocole non pris en charge : postgres ou postgresql attendu",
  protocolePublic: "protocole non pris en charge : http ou https attendu",
  origineNonExacte: "origine non exacte : schéma, hôte et port, sans chemin ni joker",
  entier: "entier attendu",
  horsBornes: "port hors bornes : 65535 au plus",
  modeInconnu: "valeur non reconnue : development, test ou production",
} as const;

export type RaisonDeRefus = (typeof RAISONS)[keyof typeof RAISONS];

// L'ordre est la priorité : une variable à plusieurs défauts reçoit la première qui s'applique.
export const RAISONS_DE_REFUS: readonly RaisonDeRefus[] = Object.freeze([
  RAISONS.absente,
  RAISONS.factice,
  RAISONS.tropCourte,
  RAISONS.urlMalFormee,
  RAISONS.protocolePostgres,
  RAISONS.protocolePublic,
  RAISONS.origineNonExacte,
  RAISONS.entier,
  RAISONS.horsBornes,
  RAISONS.modeInconnu,
]);

export interface VariableRefusee {
  readonly variable: string;
  readonly raison: RaisonDeRefus;
}

export class ErreurConfiguration extends Error {
  readonly variables: readonly string[];
  // Dans l'ordre de `variables`, une raison par variable.
  readonly raisons: readonly VariableRefusee[];

  constructor(raisons: readonly VariableRefusee[]) {
    const variables = raisons.map(({ variable }) => variable);
    super(`Configuration invalide : ${variables.join(", ")}`);
    this.name = "ErreurConfiguration";
    this.variables = Object.freeze(variables);
    this.raisons = Object.freeze(raisons.map((refus) => Object.freeze({ ...refus })));
  }
}

// F-031-AC12, ADR-0017 : le texte entier du refus, écrit par main.ts et par l'entrée de
// vérification. La première ligne est le message, inchangé depuis F-008-AC12 ; suit une ligne
// par variable ; le texte finit par un saut de ligne.
export function texteDuRefus(erreur: ErreurConfiguration): string {
  const lignes = erreur.raisons.map(({ variable, raison }) => `- ${variable} : ${raison}`);
  return `${[erreur.message, ...lignes].join("\n")}\n`;
}

function urlDe(texte: string): URL | undefined {
  return URL.canParse(texte) ? new URL(texte) : undefined;
}

function estUneUrl(texte: string): boolean {
  return URL.canParse(texte);
}

function estUneUrlPostgres(texte: string): boolean {
  return PROTOCOLES_POSTGRES.includes(urlDe(texte)?.protocol ?? "");
}

function estUneUrlPublique(texte: string): boolean {
  return PROTOCOLES_PUBLICS.includes(urlDe(texte)?.protocol ?? "");
}

// Une origine exacte : schéma, hôte et port, sans chemin ; le joker `*` n'en est pas une.
function estUneOrigineExacte(texte: string): boolean {
  return urlDe(texte)?.origin === texte;
}

function enListe(origines: string): string[] {
  return origines === "" ? [] : origines.split(SEPARATEUR_DES_ORIGINES);
}

// Chaque contrôle porte sa raison (F-031-AC12) : le constat de zod la rend comme message. Tous les
// contrôles d'une variable s'exercent, l'ordre de RAISONS_DE_REFUS choisit entre leurs raisons.
const schemaEnvironnement = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"], RAISONS.modeInconnu)
    .default("development"),
  HOTE: z.string(RAISONS.absente).min(1, RAISONS.absente).default("127.0.0.1"),
  PORT: z
    .string(RAISONS.absente)
    .regex(/^\d+$/, RAISONS.entier)
    .default("3000")
    .transform(Number)
    .pipe(z.number(RAISONS.horsBornes).max(PORT_MAX, RAISONS.horsBornes)),
  URL_BASE_DONNEES: z
    .string(RAISONS.absente)
    .refine(estUneUrl, RAISONS.urlMalFormee)
    .refine(estUneUrlPostgres, RAISONS.protocolePostgres),
  ORIGINES_AUTORISEES: z
    .string(RAISONS.absente)
    .default("")
    .transform(enListe)
    .pipe(
      z.array(
        z
          .string(RAISONS.absente)
          .refine(estUneUrl, RAISONS.urlMalFormee)
          .refine(estUneOrigineExacte, RAISONS.origineNonExacte),
      ),
    ),
  BETTER_AUTH_SECRET: z.string(RAISONS.absente).min(LONGUEUR_MIN_DU_SECRET, RAISONS.tropCourte),
  URL_PUBLIQUE: z
    .string(RAISONS.absente)
    .refine(estUneUrl, RAISONS.urlMalFormee)
    .refine(estUneUrlPublique, RAISONS.protocolePublic)
    .refine(estUneOrigineExacte, RAISONS.origineNonExacte),
  PROXYS_DE_CONFIANCE: z
    .string(RAISONS.absente)
    .regex(/^\d+$/, RAISONS.entier)
    .default("0")
    .transform(Number)
    .pipe(z.int(RAISONS.entier)),
});

const VARIABLES = Object.keys(schemaEnvironnement.shape);

// Le mot de passe d'une URL y est encodé ; un encodage illisible le laisse tel quel.
function motDePasseDe(url: string): string | undefined {
  const encode = urlDe(url)?.password;
  try {
    return encode === undefined ? undefined : decodeURIComponent(encode);
  } catch {
    return encode;
  }
}

// F-008-AC14, F-009-AC18 : en production, le secret d'un fichier d'exemple n'est pas un secret.
function secretsFacticesEnProduction(env: Environnement): string[] {
  if (env.NODE_ENV !== "production") {
    return [];
  }
  const factices = {
    URL_BASE_DONNEES: motDePasseDe(env.URL_BASE_DONNEES ?? "") === MOT_DE_PASSE_FACTICE,
    BETTER_AUTH_SECRET: env.BETTER_AUTH_SECRET === SECRET_FACTICE,
  };
  return Object.entries(factices).flatMap(([variable, factice]) => (factice ? [variable] : []));
}

// La première raison de la liste parmi celles d'une variable ; vide ou absente, elle est absente.
function raisonDe(valeur: string | undefined, messages: readonly string[]): RaisonDeRefus {
  if (valeur === undefined || valeur === "") {
    return RAISONS.absente;
  }
  const raison = RAISONS_DE_REFUS.find((candidate) => messages.includes(candidate));
  if (raison === undefined) {
    // Erreur de programmation : chaque contrôle du schéma porte une raison de la liste.
    throw new TypeError("Contrôle de configuration sans raison de la liste.");
  }
  return raison;
}

function raisonsDuRefus(
  env: Environnement,
  messages: ReadonlyMap<string, readonly string[]>,
): VariableRefusee[] {
  return VARIABLES.filter((variable) => messages.has(variable)).map((variable) => ({
    variable,
    raison: raisonDe(env[variable], messages.get(variable) ?? []),
  }));
}

export function lireConfiguration(env: Environnement): Configuration {
  const lu = schemaEnvironnement.safeParse(env);
  const messages = new Map<string, string[]>();
  const constats = [
    ...(lu.error?.issues.map(({ path, message }) => [String(path[0]), message] as const) ?? []),
    ...secretsFacticesEnProduction(env).map((variable) => [variable, RAISONS.factice] as const),
  ];
  for (const [variable, message] of constats) {
    messages.set(variable, [...(messages.get(variable) ?? []), message]);
  }
  if (!lu.success || messages.size > 0) {
    throw new ErreurConfiguration(raisonsDuRefus(env, messages));
  }
  return Object.freeze({
    hote: lu.data.HOTE,
    port: lu.data.PORT,
    urlBaseDonnees: lu.data.URL_BASE_DONNEES,
    originesAutorisees: Object.freeze(lu.data.ORIGINES_AUTORISEES),
    secretDesSessions: lu.data.BETTER_AUTH_SECRET,
    urlPublique: lu.data.URL_PUBLIQUE,
    cookiesSecurises:
      lu.data.NODE_ENV === "production" || lu.data.URL_PUBLIQUE.startsWith("https://"),
    proxysDeConfiance: lu.data.PROXYS_DE_CONFIANCE,
  });
}
