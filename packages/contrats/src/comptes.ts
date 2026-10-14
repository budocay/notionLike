// Contrats des comptes et des sessions (F-009-AC22). Les quatre routes d'authentification sont
// celles de better-auth, avec ses corps natifs ; `GET /api/v1/moi` est la nôtre.
import { z } from "zod";

export const CHEMINS_COMPTES = {
  inscription: "/api/auth/sign-up/email",
  connexion: "/api/auth/sign-in/email",
  deconnexion: "/api/auth/sign-out",
  session: "/api/auth/get-session",
  moi: "/api/v1/moi",
} as const;

const NOM_MAX = 100;
const COURRIEL_MAX = 254;
const MOT_DE_PASSE_MIN = 12;
const MOT_DE_PASSE_MAX = 128;

// Un courriel bordé de blancs est refusé, jamais corrigé (F-009-AC2).
const courriel = z.email().max(COURRIEL_MAX);

function porteAutreChoseQueDesBlancs(texte: string): boolean {
  return texte.trim() !== "";
}

// Les bornes de F-009-AC4, que la gestion du compte de F-027 reprend telles quelles : un nom de 1 à
// 100 caractères qui ne se réduit pas à des blancs, un mot de passe de 12 à 128 caractères.
export const schemaNomDuCompte = z.string().max(NOM_MAX).refine(porteAutreChoseQueDesBlancs);
export const schemaNouveauMotDePasse = z.string().min(MOT_DE_PASSE_MIN).max(MOT_DE_PASSE_MAX);
// Un mot de passe présenté pour être vérifié n'a que la borne haute : trop court, il est faux.
export const schemaMotDePassePresente = z.string().max(MOT_DE_PASSE_MAX);

export const schemaCorpsInscription = z.object({
  name: schemaNomDuCompte,
  email: courriel,
  password: schemaNouveauMotDePasse,
});

export type CorpsInscription = z.infer<typeof schemaCorpsInscription>;

// La connexion ne vérifie que la borne haute : un mot de passe trop court est un mot de passe
// faux, refusé comme tel (F-009-AC8).
export const schemaCorpsConnexion = z.object({
  email: courriel,
  password: schemaMotDePassePresente,
});

export type CorpsConnexion = z.infer<typeof schemaCorpsConnexion>;

// Réponse de `GET /api/v1/moi` : ces trois champs, aucun autre.
export const schemaCompte = z.strictObject({
  id: z.uuid(),
  nom: z.string().min(1),
  courriel,
});

export type Compte = z.infer<typeof schemaCompte>;

// Le compte tel que better-auth le rend dans ses corps natifs : au moins ces trois champs.
export const schemaCompteNatif = z.looseObject({
  id: z.uuid(),
  name: z.string().min(1),
  email: courriel,
});
