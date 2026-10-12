// Configuration du serveur (ADR-0004) : les variables d'environnement sont validées une fois, par
// un schéma, avant toute écoute. Une erreur nomme les variables fautives, jamais leur valeur.
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

export class ErreurConfiguration extends Error {
  readonly variables: readonly string[];

  constructor(variables: readonly string[]) {
    super(`Configuration invalide : ${variables.join(", ")}`);
    this.name = "ErreurConfiguration";
    this.variables = variables;
  }
}

function urlDe(texte: string): URL | undefined {
  return URL.canParse(texte) ? new URL(texte) : undefined;
}

function estUneUrlPostgres(texte: string): boolean {
  return PROTOCOLES_POSTGRES.includes(urlDe(texte)?.protocol ?? "");
}

// Une origine exacte : schéma, hôte et port, sans chemin ; le joker `*` n'en est pas une.
function estUneOrigineExacte(texte: string): boolean {
  return urlDe(texte)?.origin === texte;
}

function estUneOriginePublique(texte: string): boolean {
  return estUneOrigineExacte(texte) && PROTOCOLES_PUBLICS.includes(urlDe(texte)?.protocol ?? "");
}

function enListe(origines: string): string[] {
  return origines === "" ? [] : origines.split(SEPARATEUR_DES_ORIGINES);
}

const schemaEnvironnement = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOTE: z.string().min(1).default("127.0.0.1"),
  PORT: z.string().regex(/^\d+$/).default("3000").transform(Number).pipe(z.number().max(PORT_MAX)),
  URL_BASE_DONNEES: z.string().refine(estUneUrlPostgres),
  ORIGINES_AUTORISEES: z
    .string()
    .default("")
    .transform(enListe)
    .pipe(z.array(z.string().refine(estUneOrigineExacte))),
  BETTER_AUTH_SECRET: z.string().min(LONGUEUR_MIN_DU_SECRET),
  URL_PUBLIQUE: z.string().refine(estUneOriginePublique),
  PROXYS_DE_CONFIANCE: z.string().regex(/^\d+$/).default("0").transform(Number).pipe(z.int()),
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

export function lireConfiguration(env: Environnement): Configuration {
  const lu = schemaEnvironnement.safeParse(env);
  const fautives = new Set([
    ...(lu.error?.issues.map((constat) => String(constat.path[0])) ?? []),
    ...secretsFacticesEnProduction(env),
  ]);
  if (!lu.success || fautives.size > 0) {
    throw new ErreurConfiguration(VARIABLES.filter((variable) => fautives.has(variable)));
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
