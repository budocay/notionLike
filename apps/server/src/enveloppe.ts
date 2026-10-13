// Enveloppe d'erreur (ADR-0004) : une seule fonction l'écrit ; le statut et le message sortent
// d'une table indexée par le code. L'identifiant de requête n'a qu'une source : l'en-tête posé ici.
import { randomUUID } from "node:crypto";

import type { CodeErreur, EnveloppeErreur } from "@notionlike/contrats";
import type { ErrorRequestHandler, RequestHandler, Response } from "express";

import type { Journal } from "./journal.ts";

// Taille maximale d'un corps de requête, sur toute route (F-008-AC6, F-009-AC28).
export const LIMITE_CORPS_OCTETS = 100_000;

const EN_TETE_ID_REQUETE = "X-Request-Id";
const STATUT_CORPS_TROP_GRAND = 413;
const PREMIER_STATUT_CLIENT = 400;
const PREMIER_STATUT_SERVEUR = 500;

const REPONSES: Readonly<Record<CodeErreur, { statut: number; message: string }>> = {
  "requete-invalide": { statut: 400, message: "La requête est invalide." },
  "ressource-introuvable": { statut: 404, message: "La ressource demandée est introuvable." },
  "corps-trop-grand": { statut: 413, message: "Le corps de la requête est trop grand." },
  "base-indisponible": { statut: 503, message: "La base de données est indisponible." },
  "erreur-interne": { statut: 500, message: "Une erreur interne est survenue." },
  "non-authentifie": { statut: 401, message: "Cette requête exige une session valide." },
  "trop-de-requetes": { statut: 429, message: "Trop de requêtes : réessayez plus tard." },
  // F-011-AC31, H12 : 404 pour ce qu'un compte ne doit pas voir, 403 pour un rôle insuffisant ou
  // une origine refusée, 409 pour un conflit d'état.
  "acces-refuse": { statut: 403, message: "Votre rôle ne permet pas cette action." },
  "origine-refusee": { statut: 403, message: "L'origine de la requête est refusée." },
  "identifiant-indisponible": { statut: 409, message: "Cet identifiant est indisponible." },
  "dernier-proprietaire": {
    statut: 409,
    message: "L'espace doit garder au moins un propriétaire.",
  },
  "deja-membre": { statut: 409, message: "Le compte est déjà membre de cet espace." },
  "invitation-invalide": { statut: 404, message: "L'invitation est invalide." },
  "quota-atteint": { statut: 409, message: "Un quota est atteint." },
};

// F-008-AC4 : l'identifiant est généré ici ; celui que la requête porterait n'est jamais lu.
export const identifierLaRequete: RequestHandler = (_requete, reponse, suivant) => {
  reponse.setHeader(EN_TETE_ID_REQUETE, randomUUID());
  suivant();
};

export function idRequeteDe(reponse: Response): string {
  return String(reponse.getHeader(EN_TETE_ID_REQUETE));
}

export function envoyerErreur(reponse: Response, code: CodeErreur): void {
  const { statut, message } = REPONSES[code];
  const enveloppe: EnveloppeErreur = { code, message, idRequete: idRequeteDe(reponse) };
  reponse.status(statut).json(enveloppe);
}

export const repondreIntrouvable: RequestHandler = (_requete, reponse) => {
  envoyerErreur(reponse, "ressource-introuvable");
};

// Les erreurs de lecture du corps levées par Express portent un `status` entre 400 et 499.
function statutClientDe(erreur: unknown): number | undefined {
  const statut = erreur instanceof Error && "status" in erreur ? erreur.status : undefined;
  const estClient =
    typeof statut === "number" &&
    statut >= PREMIER_STATUT_CLIENT &&
    statut < PREMIER_STATUT_SERVEUR;
  return estClient ? statut : undefined;
}

// L'erreur d'un corps illisible porte ce corps : elle n'est pas journalisée. Toute autre erreur
// l'est en entier, et la réponse n'en dit rien (F-008-AC8).
export function creerGestionnaireDErreurs(journal: Journal): ErrorRequestHandler {
  return (erreur: unknown, _requete, reponse, _suivant) => {
    const statutClient = statutClientDe(erreur);
    if (statutClient === undefined) {
      journal.erreurInterne(idRequeteDe(reponse), erreur);
      envoyerErreur(reponse, "erreur-interne");
    } else {
      const trop = statutClient === STATUT_CORPS_TROP_GRAND;
      envoyerErreur(reponse, trop ? "corps-trop-grand" : "requete-invalide");
    }
  };
}
