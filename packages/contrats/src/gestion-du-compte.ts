// Contrats de la gestion du compte (F-027-AC19) : changement du nom et du mot de passe, liste et
// révocation des sessions. Les cinq routes sont les nôtres, sous `/api/v1/compte`, toutes protégées ;
// aucune route native de better-auth ne s'ouvre pour elles (F-027 H1). Chaque corps de requête et de
// réponse a son schéma strict : un champ que le schéma ne nomme pas est refusé.
import { z } from "zod";

import { schemaMotDePassePresente, schemaNomDuCompte, schemaNouveauMotDePasse } from "./comptes.ts";
import type { RouteApi } from "./espaces.ts";

// Un segment `:nom` est un paramètre du chemin, comme dans `CHEMINS_ESPACES`.
export const CHEMINS_DU_COMPTE = {
  compte: "/api/v1/compte",
  motDePasse: "/api/v1/compte/mot-de-passe",
  sessions: "/api/v1/compte/sessions",
  revocation: "/api/v1/compte/sessions/:idSession/revocation",
  revocationDesAutres: "/api/v1/compte/sessions/revocation-des-autres",
} as const;

export const ROUTES_DU_COMPTE: readonly RouteApi[] = [
  { methode: "PATCH", chemin: CHEMINS_DU_COMPTE.compte },
  { methode: "POST", chemin: CHEMINS_DU_COMPTE.motDePasse },
  { methode: "GET", chemin: CHEMINS_DU_COMPTE.sessions },
  { methode: "POST", chemin: CHEMINS_DU_COMPTE.revocation },
  { methode: "POST", chemin: CHEMINS_DU_COMPTE.revocationDesAutres },
];

// F-027-AC9 : sessions listées au plus, longueur de l'agent utilisateur rendu (en unités UTF-16,
// comme `String.length`). F-027-AC15 : plafonds par compte, sur une fenêtre de 60 secondes ; les
// actions sensibles sont le changement de mot de passe et les deux révocations.
export const PLAFONDS_DU_COMPTE = {
  sessionsListees: 100,
  agentUtilisateur: 300,
  actionsSensibles: { fenetreS: 60, max: 5 },
  requetes: { fenetreS: 60, max: 30 },
} as const;

// F-027-AC11 : l'identifiant de session est l'`uuid` de sa ligne, en forme canonique ; jamais le
// jeton de session.
const UUID_CANONIQUE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const identifiant = z.string().regex(UUID_CANONIQUE);
const instant = z.iso.datetime();

// Corps des requêtes. Toute action sensible porte le mot de passe actuel (F-027 H3).
export const schemaCorpsChangementDeNom = z.strictObject({ nom: schemaNomDuCompte });
export const schemaCorpsChangementDeMotDePasse = z.strictObject({
  motDePasseActuel: schemaMotDePassePresente,
  nouveauMotDePasse: schemaNouveauMotDePasse,
});
// Le corps des deux révocations.
export const schemaCorpsRevocation = z.strictObject({ motDePasseActuel: schemaMotDePassePresente });

export type CorpsChangementDeNom = z.infer<typeof schemaCorpsChangementDeNom>;
export type CorpsChangementDeMotDePasse = z.infer<typeof schemaCorpsChangementDeMotDePasse>;
export type CorpsRevocation = z.infer<typeof schemaCorpsRevocation>;

// Corps des réponses. `PATCH /api/v1/compte` rend `schemaCompte`, celui de `GET /api/v1/moi`.
// `prolongeeLe` : la dernière prolongation de la session (F-009-AC12), ou son ouverture.
export const schemaSessionDuCompte = z.strictObject({
  idSession: identifiant,
  creeLe: instant,
  prolongeeLe: instant,
  expireLe: instant,
  adresseIp: z.string().min(1).nullable(),
  agentUtilisateur: z.string().max(PLAFONDS_DU_COMPTE.agentUtilisateur).nullable(),
  courante: z.boolean(),
});
export const schemaListeSessions = z.strictObject({
  sessions: z.array(schemaSessionDuCompte).max(PLAFONDS_DU_COMPTE.sessionsListees),
});
export const schemaRevocationDesAutres = z.strictObject({
  supprimees: z.number().int().nonnegative(),
});

export type SessionDuCompte = z.infer<typeof schemaSessionDuCompte>;
export type ListeSessions = z.infer<typeof schemaListeSessions>;
export type RevocationDesAutres = z.infer<typeof schemaRevocationDesAutres>;
