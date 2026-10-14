// Gestion du compte (F-027) : changement du nom et du mot de passe, liste et révocation des
// sessions, par cinq routes à nous sous `/api/v1/compte` (H1). L'ordre est fixe : session (401),
// origine (403), plafonds (429), corps (400), mot de passe actuel d'une action sensible (403), puis
// l'action. Session, origine et plafonds passent avant toute lecture du corps (F-027-AC14). Aucune
// route ne lit d'identifiant de compte : elles n'agissent que sur le compte de la session. Toute
// suppression de session passe par la fonction de suppression (F-009-AC33, H7).
import {
  CHEMINS_DU_COMPTE,
  PLAFONDS_DU_COMPTE,
  schemaCompte,
  schemaCorpsChangementDeMotDePasse,
  schemaCorpsChangementDeNom,
  schemaCorpsRevocation,
  schemaListeSessions,
  schemaRevocationDesAutres,
  type SessionDuCompte,
} from "@notionlike/contrats";
import {
  ecrireEmpreinte,
  lireEmpreinte,
  listerSessions,
  renommerCompte,
  verrouillerSessionDuCompte,
  type Base,
  type SessionDuCompteLue,
} from "@notionlike/db";
import express, { type Express, type Request, type RequestHandler, type Response } from "express";
import type { z } from "zod";

import { adresseDe } from "./adresse.ts";
import {
  corpsJsonDe,
  sessionDeLaRequete,
  type DependancesDeSession,
  type SessionConnectee,
} from "./comptes.ts";
import type { Consommer } from "./debit.ts";
import { empreinteDe, verifierLeMotDePasse } from "./empreinte.ts";
import { envoyerErreur, idRequeteDe, LIMITE_CORPS_OCTETS } from "./enveloppe.ts";
import type { TypeDEvenement } from "./journal.ts";
import { origineAdmise, type OriginesAdmises } from "./origine.ts";
import type { SuppressionDeSessions } from "./sessions.ts";

const STATUT_OK = 200;
const STATUT_SANS_CONTENU = 204;
const UUID_CANONIQUE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export interface DependancesDuCompte extends DependancesDeSession, OriginesAdmises {
  readonly base: Base;
  readonly suppression: SuppressionDeSessions;
  // Les compteurs des plafonds de F-027-AC15, propres à ces routes, sur l'horloge injectée.
  readonly consommer: Consommer;
  readonly horloge: () => Date;
}

interface Contexte extends SessionConnectee {
  readonly requete: Request;
  readonly reponse: Response;
  readonly idRequete: string;
  readonly adresse: string;
}

// Le contexte établi avant la lecture du corps, rangé dans `reponse.locals` pour l'étape suivante.
const CLE_DU_CONTEXTE = "contexteDuCompte";

function contexteDe(requete: Request, reponse: Response): Contexte {
  return { ...(reponse.locals[CLE_DU_CONTEXTE] as Contexte), requete, reponse };
}

function journaliser(
  { journal }: DependancesDuCompte,
  contexte: Contexte,
  type: TypeDEvenement,
  idSession?: string,
): void {
  journal.evenementDeCompte({
    type,
    idRequete: contexte.idRequete,
    adresse: contexte.adresse,
    idCompte: contexte.compte.id,
    idSession,
  });
}

// F-027-AC15 : un plafond atteint répond 429 avec `Retry-After` (entier de 1 à 60), sans rien faire.
function plafondAtteint(
  dependances: DependancesDuCompte,
  contexte: Contexte,
  sensible: boolean,
): boolean {
  const { requetes, actionsSensibles } = PLAFONDS_DU_COMPTE;
  const id = contexte.compte.id;
  const general = dependances.consommer(`compte-requetes|${id}`, requetes);
  const decision =
    general.permise && sensible
      ? dependances.consommer(`compte-actions-sensibles|${id}`, actionsSensibles)
      : general;
  if (decision.permise) {
    return false;
  }
  journaliser(dependances, contexte, "debit-depasse");
  contexte.reponse.set("Retry-After", String(decision.attenteS));
  envoyerErreur(contexte.reponse, "trop-de-requetes");
  return true;
}

// Session (F-027-AC14), origine (AC16), plafonds (AC15), dans cet ordre et avant le corps.
function accueillir(dependances: DependancesDuCompte, sensible: boolean): RequestHandler {
  return async (requete, reponse, suivant) => {
    const connectee = await sessionDeLaRequete(dependances, requete, reponse);
    if (connectee === undefined) {
      return;
    }
    if (!origineAdmise(dependances, requete)) {
      envoyerErreur(reponse, "origine-refusee");
      return;
    }
    const contexte: Contexte = {
      ...connectee,
      requete,
      reponse,
      idRequete: idRequeteDe(reponse),
      adresse: adresseDe(requete, dependances.proxysDeConfiance),
    };
    if (plafondAtteint(dependances, contexte, sensible)) {
      return;
    }
    reponse.locals[CLE_DU_CONTEXTE] = contexte;
    suivant();
  };
}

// Un corps hors du schéma strict reçoit 400, avant tout calcul d'empreinte (F-027-AC2, AC7).
function corpsSelon<T>(schema: z.ZodType<T>, { requete, reponse }: Contexte): T | undefined {
  const lu = schema.safeParse(corpsJsonDe(requete));
  if (!lu.success) {
    envoyerErreur(reponse, "requete-invalide");
    return undefined;
  }
  return lu.data;
}

// F-027-AC6 : le mot de passe actuel d'une action sensible, vérifié en temps constant ; un refus
// répond 403 sans rien modifier ni fermer la session courante.
async function motDePasseVerifie(
  dependances: DependancesDuCompte,
  contexte: Contexte,
  motDePasseActuel: string,
  idSessionVisee?: string,
): Promise<boolean> {
  const empreinte = await lireEmpreinte(dependances.base.db, contexte.compte.id);
  if (await verifierLeMotDePasse(motDePasseActuel, empreinte)) {
    return true;
  }
  journaliser(dependances, contexte, "mot-de-passe-incorrect", idSessionVisee);
  envoyerErreur(contexte.reponse, "mot-de-passe-incorrect");
  return false;
}

// Toute réponse passe par le schéma publié : un champ de trop lève, et sort en 500.
function repondre<T>(reponse: Response, schema: z.ZodType<T>, corps: T): void {
  reponse.status(STATUT_OK).json(schema.parse(corps));
}

// Une unité UTF-16 haute seule en fin de texte n'est pas gardée : la coupe ne casse pas un signe.
function tronquer(texte: string, longueur: number): string {
  const coupe = texte.slice(0, longueur);
  return /[\uD800-\uDBFF]$/.test(coupe) ? coupe.slice(0, -1) : coupe;
}

function versLeContrat(session: SessionDuCompteLue, idCourante: string): SessionDuCompte {
  const { agentUtilisateur, adresseIp } = session;
  return {
    idSession: session.idSession,
    creeLe: session.creeLe.toISOString(),
    prolongeeLe: session.prolongeeLe.toISOString(),
    expireLe: session.expireLe.toISOString(),
    adresseIp: adresseIp === null || adresseIp === "" ? null : adresseIp,
    agentUtilisateur:
      agentUtilisateur === null
        ? null
        : tronquer(agentUtilisateur, PLAFONDS_DU_COMPTE.agentUtilisateur),
    courante: session.idSession === idCourante,
  };
}

// F-027-AC1 : le nom seul est écrit ; le compte rendu est celui de `GET /api/v1/moi`.
function changerLeNom(dependances: DependancesDuCompte): RequestHandler {
  return async (requete, reponse) => {
    const contexte = contexteDe(requete, reponse);
    const corps = corpsSelon(schemaCorpsChangementDeNom, contexte);
    if (corps === undefined) {
      return;
    }
    const renomme = await renommerCompte(dependances.base.db, contexte.compte.id, corps.nom);
    if (renomme === undefined) {
      envoyerErreur(reponse, "non-authentifie");
      return;
    }
    journaliser(dependances, contexte, "nom-change");
    repondre(reponse, schemaCompte, renomme);
  };
}

// F-027-AC4 : l'empreinte nouvelle est calculée hors de la transaction ; dans la transaction, elle
// est écrite et les autres sessions sont supprimées par la fonction, qui ne prévient ses abonnés
// qu'après la validation. Une erreur annule les deux (AC17).
function changerLeMotDePasse(dependances: DependancesDuCompte): RequestHandler {
  return async (requete, reponse) => {
    const contexte = contexteDe(requete, reponse);
    const corps = corpsSelon(schemaCorpsChangementDeMotDePasse, contexte);
    if (
      corps === undefined ||
      !(await motDePasseVerifie(dependances, contexte, corps.motDePasseActuel))
    ) {
      return;
    }
    const empreinte = await empreinteDe(corps.nouveauMotDePasse);
    const { id } = contexte.compte;
    await dependances.suppression.dansUneTransaction(async (transaction, supprimer) => {
      if (!(await ecrireEmpreinte(transaction, id, empreinte))) {
        throw new Error("ligne de mot de passe introuvable");
      }
      return supprimer({ idCompte: id, sauf: contexte.idSession });
    });
    journaliser(dependances, contexte, "mot-de-passe-change");
    reponse.status(STATUT_SANS_CONTENU).end();
  };
}

// F-027-AC9 : les sessions non expirées du compte, sans jeton, la courante désignée.
function listerLesSessions(dependances: DependancesDuCompte): RequestHandler {
  return async (requete, reponse) => {
    const contexte = contexteDe(requete, reponse);
    const sessions = await listerSessions(dependances.base.db, {
      idCompte: contexte.compte.id,
      maintenant: dependances.horloge(),
      limite: PLAFONDS_DU_COMPTE.sessionsListees,
    });
    repondre(reponse, schemaListeSessions, {
      sessions: sessions.map((session) => versLeContrat(session, contexte.idSession)),
    });
  };
}

function parametre(requete: Request, nom: string): string {
  const valeur: unknown = requete.params[nom];
  return typeof valeur === "string" ? valeur : "";
}

// F-027-AC10, AC11 : la session visée est verrouillée puis supprimée dans une même transaction,
// si elle est une autre session non expirée du compte ; sinon 404, toujours le même.
function revoquerUneSession(dependances: DependancesDuCompte): RequestHandler {
  return async (requete, reponse) => {
    const contexte = contexteDe(requete, reponse);
    const idSession = parametre(requete, "idSession");
    const corps = corpsSelon(schemaCorpsRevocation, contexte);
    if (corps === undefined) {
      return;
    }
    // F-027-AC11 : un identifiant qui n'a pas la forme canonique (majuscules comprises) ne désigne
    // aucune session : 404 avant la comparaison avec la session courante et avant toute lecture
    // en base, la vérification du mot de passe comprise. PostgreSQL compare les `uuid` sans tenir
    // compte de la casse : sans cette garde, la session courante en majuscules passerait le 409.
    if (!UUID_CANONIQUE.test(idSession)) {
      envoyerErreur(reponse, "ressource-introuvable");
      return;
    }
    if (!(await motDePasseVerifie(dependances, contexte, corps.motDePasseActuel, idSession))) {
      return;
    }
    if (idSession === contexte.idSession) {
      envoyerErreur(reponse, "session-courante");
      return;
    }
    const supprimees = await dependances.suppression.dansUneTransaction(
      async (transaction, supprimer) => {
        const cible = {
          idCompte: contexte.compte.id,
          idSession,
          maintenant: dependances.horloge(),
        };
        return (await verrouillerSessionDuCompte(transaction, cible))
          ? supprimer({ idSession })
          : [];
      },
    );
    if (supprimees.length === 0) {
      envoyerErreur(reponse, "ressource-introuvable");
      return;
    }
    journaliser(dependances, contexte, "session-revoquee", idSession);
    reponse.status(STATUT_SANS_CONTENU).end();
  };
}

// F-027-AC12 : toutes les autres sessions du compte, expirées comprises.
function revoquerLesAutres(dependances: DependancesDuCompte): RequestHandler {
  return async (requete, reponse) => {
    const contexte = contexteDe(requete, reponse);
    const corps = corpsSelon(schemaCorpsRevocation, contexte);
    if (
      corps === undefined ||
      !(await motDePasseVerifie(dependances, contexte, corps.motDePasseActuel))
    ) {
      return;
    }
    const supprimees = await dependances.suppression.dansUneTransaction((_transaction, supprimer) =>
      supprimer({ idCompte: contexte.compte.id, sauf: contexte.idSession }),
    );
    journaliser(dependances, contexte, "sessions-revoquees");
    repondre(reponse, schemaRevocationDesAutres, { supprimees: supprimees.length });
  };
}

export function monterLaGestionDuCompte(
  application: Express,
  dependances: DependancesDuCompte,
): void {
  // Le corps n'est lu qu'après l'accueil, quel que soit son type annoncé : la limite de F-008-AC6
  // vaut pour ces routes.
  const lireLeCorps = express.raw({ limit: LIMITE_CORPS_OCTETS, type: () => true });
  const ordinaire = accueillir(dependances, false);
  const sensible = accueillir(dependances, true);
  const { compte, motDePasse, sessions, revocation, revocationDesAutres } = CHEMINS_DU_COMPTE;
  application.patch(compte, ordinaire, lireLeCorps, changerLeNom(dependances));
  application.post(motDePasse, sensible, lireLeCorps, changerLeMotDePasse(dependances));
  application.get(sessions, ordinaire, listerLesSessions(dependances));
  application.post(revocationDesAutres, sensible, lireLeCorps, revoquerLesAutres(dependances));
  application.post(revocation, sensible, lireLeCorps, revoquerUneSession(dependances));
}
