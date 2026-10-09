// Configuration du serveur (ADR-0004) : les variables d'environnement sont validées une fois, par
// un schéma, avant toute écoute. Une erreur nomme les variables fautives, jamais leur valeur.
import { z } from "zod";

export const MOT_DE_PASSE_FACTICE = "factice-a-remplacer";

const PORT_MAX = 65_535;
const PROTOCOLES_POSTGRES = ["postgres:", "postgresql:"];
const SEPARATEUR_DES_ORIGINES = ",";

export interface Configuration {
  readonly hote: string;
  readonly port: number;
  readonly urlBaseDonnees: string;
  readonly originesAutorisees: readonly string[];
}

type Environnement = Readonly<Record<string, string | undefined>>;

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

// F-008-AC14 : en production, le secret d'un fichier d'exemple n'est pas un secret.
function porteLeSecretFacticeEnProduction(env: Environnement): boolean {
  const motDePasse = motDePasseDe(env.URL_BASE_DONNEES ?? "");
  return env.NODE_ENV === "production" && motDePasse === MOT_DE_PASSE_FACTICE;
}

export function lireConfiguration(env: Environnement): Configuration {
  const lu = schemaEnvironnement.safeParse(env);
  const fautives = new Set(lu.error?.issues.map((constat) => String(constat.path[0])));
  if (porteLeSecretFacticeEnProduction(env)) {
    fautives.add("URL_BASE_DONNEES");
  }
  if (!lu.success || fautives.size > 0) {
    throw new ErreurConfiguration(VARIABLES.filter((variable) => fautives.has(variable)));
  }
  return Object.freeze({
    hote: lu.data.HOTE,
    port: lu.data.PORT,
    urlBaseDonnees: lu.data.URL_BASE_DONNEES,
    originesAutorisees: Object.freeze(lu.data.ORIGINES_AUTORISEES),
  });
}
