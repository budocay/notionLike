// Aides des tests de la gestion du compte (F-027). Les comptes sont écrits en base, avec leur ligne
// de mot de passe (l'empreinte d'un même mot de passe, calculée une fois par fichier) et autant de
// sessions que le test en veut ; le cookie est celui que better-auth poserait pour chaque jeton.
// Tout corps de réponse lu passe par un schéma publié (F-027-AC19).
import { randomBytes } from "node:crypto";

import { CHEMINS_DU_COMPTE } from "@notionlike/contrats";
import { schemaComptes, type Base } from "@notionlike/db";

import { empreinteDe } from "../src/empreinte.ts";
import { SECRET_D_ESSAI, type ServeurDEssai } from "./aides.ts";
import { cookieSigne, JOUR_MS, lignesDe, NOM_DU_COOKIE } from "./aides-comptes.ts";
import { appeler, cheminDe, creerUnCompte, type CompteDEssai } from "./aides-espaces.ts";

export const MOT_DE_PASSE_ACTUEL = "mot-de-passe-actuel";
export const NOUVEAU_MOT_DE_PASSE = "nouveau-mot-de-passe";

let empreinte: Promise<string> | undefined;

export interface SessionDEssai {
  readonly idSession: string;
  readonly jeton: string;
  readonly cookie: string;
}

export interface TitulaireDEssai extends CompteDEssai {
  // La session dont le test se sert : la « session courante » de ses requêtes.
  readonly idSession: string;
}

export interface Ouverture {
  readonly expireLe?: Date;
  readonly prolongeeLe?: Date;
  readonly adresseIp?: string | null;
  readonly agentUtilisateur?: string | null;
  readonly nomDuCookie?: string;
}

// Une session de plus pour un compte, écrite en base.
export async function ouvrirUneSession(
  base: Base,
  idCompte: string,
  ouverture: Ouverture = {},
): Promise<SessionDEssai> {
  const jeton = randomBytes(24).toString("base64url");
  const prolongeeLe = ouverture.prolongeeLe ?? new Date();
  const [creee] = await base.db
    .insert(schemaComptes.session)
    .values({
      token: jeton,
      userId: idCompte,
      expiresAt: ouverture.expireLe ?? new Date(Date.now() + 7 * JOUR_MS),
      createdAt: prolongeeLe,
      updatedAt: prolongeeLe,
      ipAddress: ouverture.adresseIp ?? null,
      userAgent: ouverture.agentUtilisateur ?? null,
    })
    .returning({ id: schemaComptes.session.id });
  if (creee === undefined) {
    throw new Error("session non créée");
  }
  return {
    idSession: creee.id,
    jeton,
    cookie: cookieSigne(jeton, SECRET_D_ESSAI, ouverture.nomDuCookie ?? NOM_DU_COOKIE),
  };
}

// Un compte, sa ligne de mot de passe (`MOT_DE_PASSE_ACTUEL`) et une session valide sept jours.
export async function creerUnTitulaire(
  base: Base,
  etiquette = "titulaire",
  nomDuCookie = NOM_DU_COOKIE,
): Promise<TitulaireDEssai> {
  empreinte ??= empreinteDe(MOT_DE_PASSE_ACTUEL);
  const compte = await creerUnCompte(base, etiquette, nomDuCookie);
  await base.db.insert(schemaComptes.account).values({
    userId: compte.id,
    providerId: "credential",
    accountId: compte.id,
    password: await empreinte,
  });
  const session = (await lignesDe(base, "session")).find(({ token }) => token === compte.jeton);
  return { ...compte, idSession: session?.id ?? "" };
}

// Les identifiants des sessions d'un compte encore en base, triés.
export async function sessionsRestantes(base: Base, idCompte: string): Promise<string[]> {
  const lignes = await lignesDe(base, "session");
  return lignes
    .filter(({ userId }) => userId === idCompte)
    .map(({ id }) => id)
    .sort();
}

export async function empreinteDuCompte(base: Base, idCompte: string): Promise<string | null> {
  const lignes = await lignesDe(base, "account");
  return lignes.find(({ userId }) => userId === idCompte)?.password ?? null;
}

// Les cinq requêtes de la spec, telles qu'un navigateur servi par l'URL publique les envoie.
export function changerLeNom(serveur: ServeurDEssai, cookie: string | undefined, corps: unknown) {
  return appeler(serveur, "PATCH", CHEMINS_DU_COMPTE.compte, { cookie, corps });
}

export function changerLeMotDePasse(
  serveur: ServeurDEssai,
  cookie: string | undefined,
  corps: unknown = {
    motDePasseActuel: MOT_DE_PASSE_ACTUEL,
    nouveauMotDePasse: NOUVEAU_MOT_DE_PASSE,
  },
) {
  return appeler(serveur, "POST", CHEMINS_DU_COMPTE.motDePasse, { cookie, corps });
}

export function listerLesSessions(serveur: ServeurDEssai, cookie: string | undefined) {
  return appeler(serveur, "GET", CHEMINS_DU_COMPTE.sessions, { cookie });
}

export function revoquer(
  serveur: ServeurDEssai,
  cookie: string | undefined,
  idSession: string,
  corps: unknown = { motDePasseActuel: MOT_DE_PASSE_ACTUEL },
) {
  return appeler(serveur, "POST", cheminDe(CHEMINS_DU_COMPTE.revocation, { idSession }), {
    cookie,
    corps,
  });
}

export function revoquerLesAutres(
  serveur: ServeurDEssai,
  cookie: string | undefined,
  corps: unknown = { motDePasseActuel: MOT_DE_PASSE_ACTUEL },
) {
  return appeler(serveur, "POST", CHEMINS_DU_COMPTE.revocationDesAutres, { cookie, corps });
}
