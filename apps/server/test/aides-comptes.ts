// Aides des tests des comptes (F-009). Une base embarquée migrée par fichier de test : chaque test
// y crée ses comptes sous des courriels qui lui sont propres, et lance son serveur, donc ses
// compteurs de débit (H12). Tout corps lu passe par un schéma publié (F-009-AC22).
import { createHmac } from "node:crypto";
import { request as requeteHttp, type Agent, type IncomingHttpHeaders } from "node:http";

import {
  CHEMINS_COMPTES,
  schemaCompte,
  schemaCompteNatif,
  type Compte,
  type CorpsInscription,
} from "@notionlike/contrats";
import { schemaComptes, type Base, type SessionSupprimee } from "@notionlike/db";
import { ouvrirBaseEmbarqueeMigree } from "@notionlike/db/essai";
import { z } from "zod";

import {
  lancerServeur,
  SECRET_D_ESSAI,
  URL_PUBLIQUE_D_ESSAI,
  type Reglages,
  type ServeurDEssai,
} from "./aides.ts";

export const MOT_DE_PASSE_D_ADA = "mot-de-passe-d-ada";

export const ADA: CorpsInscription = {
  name: "Ada Lovelace",
  email: "ada@exemple.test",
  password: MOT_DE_PASSE_D_ADA,
};

// Délai d'un test des comptes : une base embarquée à ouvrir, des empreintes Argon2id à calculer,
// sur une machine que d'autres suites de tests peuvent occuper.
export const DELAI_DES_COMPTES_MS = 30_000;

export const NOM_DU_COOKIE = "better-auth.session_token";
export const NOM_DU_COOKIE_SECURISE = `__Secure-${NOM_DU_COOKIE}`;
// Durée d'une session et durée de vie de son cookie : 7 jours (F-009-AC9, AC12).
export const SEPT_JOURS_S = 604_800;
export const JOUR_MS = 86_400_000;

const COOKIE_DE_SESSION = /^(?:__Secure-)?better-auth\.session_token=/;

const schemaCorpsNatif = z.looseObject({ token: z.string().min(1), user: schemaCompteNatif });

export type CompteNatif = z.infer<typeof schemaCompteNatif>;

export interface Essai {
  readonly base: Base;
  readonly serveur: ServeurDEssai;
}

const basesOuvertes: Base[] = [];

// La base d'un fichier de test, ou d'un test qui la rend défaillante.
export async function ouvrirUneBase(): Promise<Base> {
  const { base } = await ouvrirBaseEmbarqueeMigree();
  basesOuvertes.push(base);
  return base;
}

export async function preparerUnEssai(reglages?: Reglages): Promise<Essai> {
  const base = await ouvrirUneBase();
  return { base, serveur: await lancerServeur(base, reglages) };
}

// À appeler une fois les serveurs arrêtés.
export async function fermerLesBases(): Promise<void> {
  await Promise.all(basesOuvertes.splice(0).map((base) => base.fermer()));
}

let rang = 0;

// Un courriel qu'aucun autre test du processus n'emploie.
export function courrielUnique(etiquette = "membre"): string {
  rang += 1;
  return `${etiquette}-${String(process.pid)}-${String(rang)}@exemple.test`;
}

export function corpsUnique(etiquette?: string): CorpsInscription {
  return { ...ADA, email: courrielUnique(etiquette) };
}

// Une requête telle qu'un navigateur servi par l'URL publique l'envoie : JSON, avec son origine.
export function poster(
  serveur: ServeurDEssai,
  chemin: string,
  corps?: unknown,
  enTetes: Readonly<Record<string, string>> = {},
): Promise<Response> {
  return fetch(`${serveur.url}${chemin}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: URL_PUBLIQUE_D_ESSAI, ...enTetes },
    ...(corps === undefined ? {} : { body: JSON.stringify(corps) }),
  });
}

export function lire(
  serveur: ServeurDEssai,
  chemin: string,
  cookie?: string,
  enTetes: Readonly<Record<string, string>> = {},
): Promise<Response> {
  return fetch(`${serveur.url}${chemin}`, {
    headers: { ...enTetes, ...(cookie === undefined ? {} : { Cookie: cookie }) },
  });
}

export function deconnecter(
  serveur: ServeurDEssai,
  cookie?: string,
  enTetes: Readonly<Record<string, string>> = {},
): Promise<Response> {
  return poster(serveur, CHEMINS_COMPTES.deconnexion, undefined, {
    ...enTetes,
    ...(cookie === undefined ? {} : { Cookie: cookie }),
  });
}

function cookiesDe(source: Response | Headers | readonly string[]): readonly string[] {
  if (source instanceof Response) {
    return source.headers.getSetCookie();
  }
  return source instanceof Headers ? source.getSetCookie() : source;
}

export interface CookiePose {
  readonly nom: string;
  readonly valeur: string;
  readonly paire: string;
  readonly attributs: readonly string[];
}

// Le cookie de session posé par une réponse ; une réponse qui n'en pose pas lève.
export function cookiePose(source: Response | Headers | readonly string[]): CookiePose {
  const pose = cookiesDe(source).find((cookie) => COOKIE_DE_SESSION.test(cookie));
  if (pose === undefined) {
    throw new Error("la réponse ne pose aucun cookie de session");
  }
  const [paire = "", ...attributs] = pose.split("; ");
  const separation = paire.indexOf("=");
  return { nom: paire.slice(0, separation), valeur: paire.slice(separation + 1), paire, attributs };
}

// Vrai si la réponse pose un cookie de session qui n'est pas un effacement.
export function poseUnCookieDeSession(source: Response | Headers | readonly string[]): boolean {
  return cookiesDe(source).some(
    (cookie) => COOKIE_DE_SESSION.test(cookie) && !cookie.includes("Max-Age=0"),
  );
}

// Vrai si la réponse efface le cookie de session.
export function effaceLeCookieDeSession(source: Response | Headers | readonly string[]): boolean {
  return cookiesDe(source).some(
    (cookie) => COOKIE_DE_SESSION.test(cookie) && cookie.includes("Max-Age=0"),
  );
}

export interface Ouverture {
  readonly cookie: string;
  readonly jeton: string;
  readonly compte: CompteNatif;
  readonly texte: string;
}

// Le corps natif d'une inscription ou d'une connexion réussie, validé, avec le cookie posé.
export async function ouvertureDe(reponse: Response): Promise<Ouverture> {
  const texte = await reponse.text();
  const { token, user } = schemaCorpsNatif.parse(JSON.parse(texte));
  return { cookie: cookiePose(reponse).paire, jeton: token, compte: user, texte };
}

export async function inscrire(serveur: ServeurDEssai, corps = ADA): Promise<Ouverture> {
  return ouvertureDe(await poster(serveur, CHEMINS_COMPTES.inscription, corps));
}

export function connecter(
  serveur: ServeurDEssai,
  { email, password }: Pick<CorpsInscription, "email" | "password"> = ADA,
  enTetes: Readonly<Record<string, string>> = {},
): Promise<Response> {
  return poster(serveur, CHEMINS_COMPTES.connexion, { email, password }, enTetes);
}

export async function compteDe(reponse: Response): Promise<Compte> {
  return schemaCompte.parse(await reponse.json());
}

type Table = keyof typeof schemaComptes;

export function lignesDe<Nom extends Table>(base: Base, table: Nom) {
  const lectures = {
    user: () => base.db.select().from(schemaComptes.user),
    session: () => base.db.select().from(schemaComptes.session),
    account: () => base.db.select().from(schemaComptes.account),
    verification: () => base.db.select().from(schemaComptes.verification),
  };
  return lectures[table]() as ReturnType<(typeof lectures)[Nom]>;
}

// Les comptes d'un courriel ; les sessions et les identifiants de connexion d'un compte.
export async function comptesDe(base: Base, email: string) {
  return (await lignesDe(base, "user")).filter((ligne) => ligne.email === email.toLowerCase());
}

export async function sessionsDe(base: Base, idCompte: string) {
  return (await lignesDe(base, "session")).filter((ligne) => ligne.userId === idCompte);
}

export async function identifiantsDe(base: Base, idCompte: string) {
  return (await lignesDe(base, "account")).filter((ligne) => ligne.userId === idCompte);
}

export async function sessionDuJeton(base: Base, jeton: string) {
  return (await lignesDe(base, "session")).find((ligne) => ligne.token === jeton);
}

// Tout ce que la base contient des comptes, en texte : pour y chercher ce qui ne doit pas y être.
export async function texteDeLaBase(base: Base): Promise<string> {
  const tables = ["user", "session", "account", "verification"] as const;
  return JSON.stringify(await Promise.all(tables.map((table) => lignesDe(base, table))));
}

// Une instruction SQL écrite par le test : rendre la base défaillante, vieillir une session.
export async function executer(base: Base, instruction: string): Promise<void> {
  await base.db.execute(instruction);
}

// Fixe la date d'expiration de la session d'un jeton.
export async function fixerLExpiration(base: Base, jeton: string, date: Date): Promise<void> {
  await executer(
    base,
    `update "session" set "expiresAt" = '${date.toISOString()}' where "token" = '${jeton}'`,
  );
}

// Le cookie que better-auth poserait pour ce jeton : signé par HMAC-SHA256 avec le secret.
export function cookieSigne(jeton: string, secret = SECRET_D_ESSAI, nom = NOM_DU_COOKIE): string {
  const signature = createHmac("sha256", secret).update(jeton).digest("base64");
  return `${nom}=${encodeURIComponent(`${jeton}.${signature}`)}`;
}

// Le jeton que porte la paire `nom=valeur` d'un cookie signé, et sa signature.
export function jetonEtSignatureDe(paire: string): { jeton: string; signature: string } {
  const valeur = decodeURIComponent(paire.slice(paire.indexOf("=") + 1));
  const point = valeur.lastIndexOf(".");
  return { jeton: valeur.slice(0, point), signature: valeur.slice(point + 1) };
}

// Les signaux de la fonction de suppression de session d'un serveur (F-009-AC33).
export function ecouterLesSuppressions(serveur: ServeurDEssai): SessionSupprimee[] {
  const recus: SessionSupprimee[] = [];
  serveur.suppression.abonner((session) => {
    recus.push(session);
  });
  return recus;
}

export interface ReponseBrute {
  readonly statut: number;
  readonly enTetes: IncomingHttpHeaders;
  readonly cookies: readonly string[];
  readonly texte: string;
}

export interface Envoi {
  readonly methode: string;
  readonly chemin: string;
  readonly enTetes?: Readonly<Record<string, string>>;
  readonly corps?: string | Buffer | undefined;
  readonly agent?: Agent;
}

// Une requête écrite telle quelle : `Host`, `X-Forwarded-*` et méthode compris, que `fetch`
// réécrit ou refuse.
export function envoyer(serveur: ServeurDEssai, envoi: Envoi): Promise<ReponseBrute> {
  return new Promise((resolve, reject) => {
    const requete = requeteHttp(
      {
        host: "127.0.0.1",
        port: serveur.port,
        method: envoi.methode,
        path: envoi.chemin,
        // La longueur est toujours annoncée : sans elle, Node n'encode pas le corps d'un GET.
        headers: {
          ...(envoi.corps === undefined
            ? {}
            : { "Content-Length": String(Buffer.byteLength(envoi.corps)) }),
          ...envoi.enTetes,
        },
        ...(envoi.agent === undefined ? {} : { agent: envoi.agent }),
      },
      (reponse) => {
        const morceaux: Buffer[] = [];
        reponse.on("data", (morceau: Buffer) => morceaux.push(morceau));
        reponse.on("end", () => {
          resolve({
            statut: reponse.statusCode ?? 0,
            enTetes: reponse.headers,
            cookies: reponse.headers["set-cookie"] ?? [],
            texte: Buffer.concat(morceaux).toString("utf8"),
          });
        });
        reponse.on("error", reject);
      },
    );
    requete.on("error", reject);
    requete.end(envoi.corps);
  });
}

// Les noms des en-têtes d'ouverture entre origines d'une réponse (F-009-AC32).
export function enTetesDOuverture(enTetes: Headers | IncomingHttpHeaders): string[] {
  const noms = enTetes instanceof Headers ? [...enTetes.keys()] : Object.keys(enTetes);
  return noms.filter((nom) => nom.toLowerCase().startsWith("access-control-"));
}
