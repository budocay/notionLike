// Seul module d'apps/web qui importe le client d'authentification (F-010-AC22, H5, H9). Il sert à
// trois appels et à rien d'autre : ni lecture de session, ni atome de session (F-010-AC4). Son
// interface n'expose aucun type de better-auth et ne rend jamais `data`, qui porte le jeton de
// session (F-010-AC20) : seulement un succès, ou une erreur classée (F-010-AC14 à AC17).
import {
  type CorpsConnexion,
  type CorpsInscription,
  type CodeErreur,
  schemaCompteNatif,
  schemaEnveloppeErreur,
} from "@notionlike/contrats";
import { createAuthClient } from "better-auth/client";

import { avecDelai, DELAI_DE_REPONSE_MS, type Requeter } from "./moi.ts";

/** Les deux codes natifs de better-auth que F-009 cite ; `packages/contrats` ne les publie pas. */
export const CODE_NATIF_COMPTE_EXISTANT = "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL";
export const CODE_NATIF_IDENTIFIANTS_INVALIDES = "INVALID_EMAIL_OR_PASSWORD";

export type ErreurDeCompte =
  | { readonly type: "compte-existant" }
  | { readonly type: "identifiants-invalides" }
  | { readonly type: "trop-de-tentatives"; readonly delaiSecondes: number }
  | { readonly type: "enveloppe"; readonly code: CodeErreur; readonly idRequete: string }
  | { readonly type: "generique" }
  | { readonly type: "hors-ligne" };

export type ResultatDeCompte =
  { readonly ok: true } | { readonly ok: false; readonly erreur: ErreurDeCompte };

export interface ClientDeCompte {
  readonly inscrire: (corps: CorpsInscription) => Promise<ResultatDeCompte>;
  readonly connecter: (corps: CorpsConnexion) => Promise<ResultatDeCompte>;
  readonly deconnecter: () => Promise<ResultatDeCompte>;
}

interface Options {
  /** Remplace `fetch` dans les tests ; absent, le client prend celui du navigateur. */
  readonly requeter?: Requeter | undefined;
  readonly delaiMs?: number | undefined;
}

const SUCCES: ResultatDeCompte = { ok: true };
const GENERIQUE: ErreurDeCompte = { type: "generique" };
const HORS_LIGNE: ErreurDeCompte = { type: "hors-ligne" };
const STATUT_TROP_DE_REQUETES = 429;
const RETRY_AFTER_MIN = 1;
const RETRY_AFTER_MAX = 60;
const ENTIER = /^\d{1,9}$/;

const NATIFS_DE_L_INSCRIPTION: ReadonlyMap<unknown, ErreurDeCompte> = new Map([
  [CODE_NATIF_COMPTE_EXISTANT, { type: "compte-existant" } as const],
]);
const NATIFS_DE_LA_CONNEXION: ReadonlyMap<unknown, ErreurDeCompte> = new Map([
  [CODE_NATIF_IDENTIFIANTS_INVALIDES, { type: "identifiants-invalides" } as const],
]);
const AUCUN_NATIF: ReadonlyMap<unknown, ErreurDeCompte> = new Map();

/**
 * La base est l'origine qui sert l'application, lue ici et jamais remplacée (F-010-AC21) : passée
 * explicitement, elle l'emporte sur toute variable d'environnement que le client sait lire. Sans
 * greffon de requête par défaut, aucune réponse ne fait naviguer l'application (F-010-AC22).
 */
export function creerClientDeCompte(options: Options = {}): ClientDeCompte {
  const client = createAuthClient({
    baseURL: window.location.origin,
    disableDefaultFetchPlugins: true,
    ...(options.requeter === undefined
      ? {}
      : { fetchOptions: { customFetchImpl: options.requeter } }),
  });
  const delaiMs = options.delaiMs ?? DELAI_DE_REPONSE_MS;
  return {
    inscrire: (corps) =>
      appeler(delaiMs, NATIFS_DE_L_INSCRIPTION, porteUnCompte, (fetchOptions) =>
        client.signUp.email({ ...corps, fetchOptions }),
      ),
    connecter: (corps) =>
      appeler(delaiMs, NATIFS_DE_LA_CONNEXION, porteUnCompte, (fetchOptions) =>
        client.signIn.email({ ...corps, fetchOptions }),
      ),
    deconnecter: () =>
      appeler(delaiMs, AUCUN_NATIF, confirmeLaDeconnexion, (fetchOptions) =>
        client.signOut({ fetchOptions }),
      ),
  };
}

interface OptionsDAppel {
  readonly signal: AbortSignal;
  /** Aucun signal de session : l'atome de session n'est jamais réveillé (F-010-AC4, AC19). */
  readonly disableSignal: true;
  /** `Retry-After` n'est lisible qu'ici : l'objet `error` ne porte pas les en-têtes (F-010-AC15). */
  readonly onResponse: (contexte: { readonly response: Response }) => void;
}

interface Rendu {
  readonly data: unknown;
  readonly error: unknown;
}

async function appeler(
  delaiMs: number,
  natifs: ReadonlyMap<unknown, ErreurDeCompte>,
  estUnSucces: (data: unknown) => boolean,
  envoyer: (options: OptionsDAppel) => Promise<Rendu>,
): Promise<ResultatDeCompte> {
  const controleur = new AbortController();
  let retryAfter: string | null = null;
  const options: OptionsDAppel = {
    signal: controleur.signal,
    disableSignal: true,
    onResponse: ({ response }) => {
      retryAfter = response.headers.get("Retry-After");
    },
  };
  try {
    const { data, error } = await avecDelai(envoyer(options), delaiMs, controleur);
    if (error !== null && error !== undefined) {
      return { ok: false, erreur: classer(error, natifs, retryAfter) };
    }
    // Un 200 n'est un succès que si sa forme l'est : une page HTML de repli n'en est pas un.
    return estUnSucces(data) ? SUCCES : { ok: false, erreur: GENERIQUE };
  } catch {
    // Échec réseau (le client lève au lieu de remplir `error`) ou délai dépassé (F-010-AC17).
    return { ok: false, erreur: HORS_LIGNE };
  }
}

/** Le statut d'abord (429, toutes familles), puis le code natif attendu, puis l'enveloppe. */
function classer(
  error: unknown,
  natifs: ReadonlyMap<unknown, ErreurDeCompte>,
  retryAfter: string | null,
): ErreurDeCompte {
  const champs: Readonly<Record<string, unknown>> =
    typeof error === "object" && error !== null ? { ...error } : {};
  if (champs.status === STATUT_TROP_DE_REQUETES) {
    return { type: "trop-de-tentatives", delaiSecondes: delaiDeRetryAfter(retryAfter) };
  }
  const natif = natifs.get(champs.code);
  if (natif !== undefined) {
    return natif;
  }
  const enveloppe = schemaEnveloppeErreur.safeParse({
    code: champs.code,
    message: champs.message,
    idRequete: champs.idRequete,
  });
  return enveloppe.success
    ? { type: "enveloppe", code: enveloppe.data.code, idRequete: enveloppe.data.idRequete }
    : GENERIQUE;
}

/** Secondes d'attente : la valeur de `Retry-After` entre 1 et 60, et 60 dans tout autre cas. */
export function delaiDeRetryAfter(valeur: string | null): number {
  const secondes = valeur !== null && ENTIER.test(valeur.trim()) ? Number(valeur.trim()) : NaN;
  return secondes >= RETRY_AFTER_MIN && secondes <= RETRY_AFTER_MAX ? secondes : RETRY_AFTER_MAX;
}

function porteUnCompte(data: unknown): boolean {
  return (
    typeof data === "object" &&
    data !== null &&
    "user" in data &&
    schemaCompteNatif.safeParse(data.user).success
  );
}

function confirmeLaDeconnexion(data: unknown): boolean {
  return typeof data === "object" && data !== null && "success" in data && data.success === true;
}
