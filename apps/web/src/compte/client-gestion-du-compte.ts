// Client de la gestion du compte (F-027-AC27) : seul module d'apps/web qui appelle les cinq routes
// du compte (`CHEMINS_DU_COMPTE`). Il ne passe pas par le client d'authentification de F-010-AC22 :
// chemins relatifs, schémas des corps et des réponses viennent de `packages/contrats`, et chaque
// réponse est validée contre son schéma strict avant d'être rendue. Aucune exception n'en sort ; une erreur est
// classée comme pour les espaces (code de l'enveloppe, 429 et son délai, réseau, réponse non
// conforme). La session voyage par son seul cookie.
import {
  CHEMINS_DU_COMPTE,
  type Compte as CompteDuServeur,
  type CorpsChangementDeMotDePasse,
  type CorpsChangementDeNom,
  type CorpsRevocation,
  schemaCompte,
  schemaCorpsChangementDeMotDePasse,
  schemaCorpsChangementDeNom,
  schemaCorpsRevocation,
  schemaListeSessions,
  schemaRevocationDesAutres,
  type SessionDuCompte,
} from "@notionlike/contrats";

import { cheminDe, creerEnvoi, lecteur, type Resultat } from "./client-espaces.ts";
import { DELAI_DE_REPONSE_MS, type Requeter } from "./moi.ts";

export type SessionLue = SessionDuCompte;
export type CompteLu = CompteDuServeur;

export interface ClientDeLaGestionDuCompte {
  readonly changerLeNom: (corps: CorpsChangementDeNom) => Promise<Resultat<CompteLu>>;
  readonly changerLeMotDePasse: (corps: CorpsChangementDeMotDePasse) => Promise<Resultat<null>>;
  readonly listerLesSessions: () => Promise<Resultat<readonly SessionLue[]>>;
  readonly revoquerUneSession: (
    idSession: string,
    corps: CorpsRevocation,
  ) => Promise<Resultat<null>>;
  /** Rend le nombre de sessions supprimées. */
  readonly revoquerLesAutres: (corps: CorpsRevocation) => Promise<Resultat<number>>;
}

const LU = 200;
const VIDE = 204;
const vide = (): null => null;

export function creerClientDeLaGestionDuCompte(
  requeter: Requeter,
  delaiMs: number = DELAI_DE_REPONSE_MS,
): ClientDeLaGestionDuCompte {
  const envoyer = creerEnvoi(requeter, delaiMs);
  return {
    changerLeNom: (corps) =>
      envoyer({
        methode: "PATCH",
        chemin: CHEMINS_DU_COMPTE.compte,
        corps: { valeur: corps, schema: schemaCorpsChangementDeNom },
        attendu: LU,
        lire: lecteur(schemaCompte),
      }),
    changerLeMotDePasse: (corps) =>
      envoyer({
        methode: "POST",
        chemin: CHEMINS_DU_COMPTE.motDePasse,
        corps: { valeur: corps, schema: schemaCorpsChangementDeMotDePasse },
        attendu: VIDE,
        lire: vide,
      }),
    listerLesSessions: () =>
      envoyer({
        methode: "GET",
        chemin: CHEMINS_DU_COMPTE.sessions,
        attendu: LU,
        lire: (corps) => lecteur(schemaListeSessions)(corps)?.sessions,
      }),
    revoquerUneSession: (idSession, corps) =>
      envoyer({
        methode: "POST",
        chemin: cheminDe(CHEMINS_DU_COMPTE.revocation, { idSession }),
        corps: { valeur: corps, schema: schemaCorpsRevocation },
        attendu: VIDE,
        lire: vide,
      }),
    revoquerLesAutres: (corps) =>
      envoyer({
        methode: "POST",
        chemin: CHEMINS_DU_COMPTE.revocationDesAutres,
        corps: { valeur: corps, schema: schemaCorpsRevocation },
        attendu: LU,
        lire: (lu) => lecteur(schemaRevocationDesAutres)(lu)?.supprimees,
      }),
  };
}
