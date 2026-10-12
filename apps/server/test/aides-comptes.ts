// Aides des tests des comptes (F-009) : chaque test a sa base embarquée migrée et son serveur,
// donc ses compteurs de débit. Tout corps lu passe par un schéma publié (F-009-AC22).
import {
  CHEMINS_COMPTES,
  schemaCompte,
  schemaCompteNatif,
  type Compte,
  type CorpsInscription,
} from "@notionlike/contrats";
import { schemaComptes, type Base } from "@notionlike/db";
import { ouvrirBaseEmbarqueeMigree } from "@notionlike/db/essai";
import { z } from "zod";

import { lancerServeur, URL_PUBLIQUE_D_ESSAI, type Reglages, type ServeurDEssai } from "./aides.ts";

export const ADA: CorpsInscription = {
  name: "Ada Lovelace",
  email: "ada@exemple.test",
  password: "mot-de-passe-d-ada",
};

const COOKIE_DE_SESSION = /^(?:__Secure-)?better-auth\.session_token=/;

const schemaCorpsNatif = z.looseObject({ token: z.string().min(1), user: schemaCompteNatif });

export type CompteNatif = z.infer<typeof schemaCompteNatif>;

export interface Essai {
  readonly base: Base;
  readonly serveur: ServeurDEssai;
}

const basesOuvertes: Base[] = [];

export async function preparerUnEssai(reglages?: Reglages): Promise<Essai> {
  const { base } = await ouvrirBaseEmbarqueeMigree();
  basesOuvertes.push(base);
  return { base, serveur: await lancerServeur(base, reglages) };
}

// À appeler après chaque test, une fois les serveurs arrêtés.
export async function fermerLesBases(): Promise<void> {
  await Promise.all(basesOuvertes.splice(0).map((base) => base.fermer()));
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

export function lire(serveur: ServeurDEssai, chemin: string, cookie?: string): Promise<Response> {
  return fetch(`${serveur.url}${chemin}`, {
    headers: cookie === undefined ? {} : { Cookie: cookie },
  });
}

// Les attributs du cookie de session posé par une réponse ; une réponse qui n'en pose pas lève.
export function cookiePose(reponse: Response): { paire: string; attributs: string[] } {
  const pose = reponse.headers.getSetCookie().find((cookie) => COOKIE_DE_SESSION.test(cookie));
  if (pose === undefined) {
    throw new Error("la réponse ne pose aucun cookie de session");
  }
  const [paire = "", ...attributs] = pose.split("; ");
  return { paire, attributs };
}

export function poseUnCookieDeSession(reponse: Response): boolean {
  return reponse.headers
    .getSetCookie()
    .some((cookie) => COOKIE_DE_SESSION.test(cookie) && !cookie.includes("Max-Age=0"));
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
): Promise<Response> {
  return poster(serveur, CHEMINS_COMPTES.connexion, { email, password });
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

// Tout ce que la base contient des comptes, en texte : pour y chercher ce qui ne doit pas y être.
export async function texteDeLaBase(base: Base): Promise<string> {
  const tables = ["user", "session", "account", "verification"] as const;
  return JSON.stringify(await Promise.all(tables.map((table) => lignesDe(base, table))));
}
