// Aides des tests de F-027 (écran du compte) : sessions et réponses du serveur simulé, validées
// contre les schémas de `packages/contrats` (F-027-AC27, H11) : un changement de contrat fait
// échouer ces tests. Les chemins sont ceux du contrat, jamais recopiés.
import {
  CHEMINS_DU_COMPTE,
  schemaCompte,
  schemaListeSessions,
  schemaRevocationDesAutres,
  type SessionDuCompte,
} from "@notionlike/contrats";
import { screen, within } from "@testing-library/react";

import { cheminDe } from "../src/compte/client-espaces.ts";
import {
  COMPTE,
  json,
  moi200,
  ROUTES,
  type ServeurSimule,
  serveurSimule,
} from "./aides-compte.tsx";

export const ID_SESSION_COURANTE = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
export const ID_AUTRE_SESSION = "6f5e4d3c-2b1a-4f0e-9d8c-7b6a5f4e3d2c";
export const NOUVEAU_MOT_DE_PASSE = "un nouveau mot de passe solide";

export const SESSION_COURANTE: SessionDuCompte = {
  idSession: ID_SESSION_COURANTE,
  creeLe: "2026-10-13T08:00:00.000Z",
  prolongeeLe: "2026-10-14T06:15:00.000Z",
  expireLe: "2026-11-13T08:00:00.000Z",
  adresseIp: "203.0.113.7",
  agentUtilisateur: "Mozilla/5.0 (X11; Linux x86_64) Firefox/140.0",
  courante: true,
};

export const AUTRE_SESSION: SessionDuCompte = {
  idSession: ID_AUTRE_SESSION,
  creeLe: "2026-10-01T09:30:00.000Z",
  prolongeeLe: "2026-10-02T10:45:00.000Z",
  expireLe: "2026-11-01T09:30:00.000Z",
  adresseIp: "198.51.100.23",
  agentUtilisateur: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) Safari/604.1",
  courante: false,
};

export const G = {
  nom: `PATCH ${CHEMINS_DU_COMPTE.compte}`,
  motDePasse: `POST ${CHEMINS_DU_COMPTE.motDePasse}`,
  sessions: `GET ${CHEMINS_DU_COMPTE.sessions}`,
  revocation: (idSession = ID_AUTRE_SESSION) =>
    `POST ${cheminDe(CHEMINS_DU_COMPTE.revocation, { idSession })}`,
  autres: `POST ${CHEMINS_DU_COMPTE.revocationDesAutres}`,
} as const;

export function sessions200(sessions: readonly unknown[]): Response {
  return json(200, schemaListeSessions.parse({ sessions }));
}

export function compte200(nom: string): Response {
  return json(200, schemaCompte.parse({ ...COMPTE, nom }));
}

export function autres200(supprimees: number): Response {
  return json(200, schemaRevocationDesAutres.parse({ supprimees }));
}

export function vide204(): Response {
  return new Response(null, { status: 204 });
}

/** Serveur d'un compte connecté, avec ces sessions ; les actions sont posées par chaque test. */
export function serveurDuCompte(
  sessions: readonly SessionDuCompte[] = [SESSION_COURANTE, AUTRE_SESSION],
): ServeurSimule {
  return serveurSimule({
    [ROUTES.moi]: () => moi200(),
    [G.sessions]: () => sessions200(sessions),
  });
}

/** Requêtes émises vers les cinq routes du compte. */
export function requetesDuCompte(serveur: ServeurSimule): string[] {
  return serveur.routesAppelees().filter((route) => route.includes("/compte"));
}

export function partie(nom: string): HTMLElement {
  return screen.getByRole("region", { name: nom });
}

export function tableauDesSessions(): Promise<HTMLElement> {
  return within(partie("Sessions")).findByRole("table", { name: "Sessions ouvertes" });
}

export function lignesDesSessions(tableau: HTMLElement): HTMLElement[] {
  return within(tableau).getAllByRole("row").slice(1);
}

export function champ(nom: RegExp): HTMLInputElement {
  const element = screen.getByLabelText(nom);
  if (!(element instanceof HTMLInputElement)) {
    throw new Error(`champ introuvable : ${String(nom)}`);
  }
  return element;
}
