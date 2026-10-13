// Composition de l'application (ADR-0004). Elle reçoit ses dépendances, n'écoute pas et ne lit
// pas `process`. L'ordre des étapes est fixe.
import { CHEMINS, type ReponsePret, type ReponseSante } from "@notionlike/contrats";
import { ErreurBase, type Base } from "@notionlike/db";
import express, { type Express, type RequestHandler } from "express";
import helmet from "helmet";

import { creerAuthentification } from "./authentification.ts";
import { monterLesComptes } from "./comptes.ts";
import type { Configuration } from "./configuration.ts";
import { creerCompteurs } from "./debit.ts";
import {
  creerGestionnaireDErreurs,
  envoyerErreur,
  identifierLaRequete,
  idRequeteDe,
  LIMITE_CORPS_OCTETS,
  repondreIntrouvable,
} from "./enveloppe.ts";
import type { Journal } from "./journal.ts";
import type { SuppressionDeSessions } from "./sessions.ts";

interface Dependances {
  readonly configuration: Configuration;
  readonly base: Base;
  readonly journal: Journal;
  // Créée par l'appelant, qui peut s'y abonner (F-009-AC33).
  readonly suppression: SuppressionDeSessions;
}

function journaliserLaReponse(journal: Journal): RequestHandler {
  return (requete, reponse, suivant) => {
    const debut = performance.now();
    reponse.on("finish", () => {
      journal.requete({
        idRequete: idRequeteDe(reponse),
        methode: requete.method,
        chemin: requete.path,
        statut: reponse.statusCode,
        dureeMs: Math.round(performance.now() - debut),
      });
    });
    suivant();
  };
}

// Les trois en-têtes de F-008-AC9 sont réglés ici, jamais laissés au défaut de la bibliothèque (H9).
function poserLesEnTetesDeSecurite(): RequestHandler {
  return helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: { "default-src": ["'none'"], "frame-ancestors": ["'none'"] },
    },
    referrerPolicy: { policy: "no-referrer" },
    xContentTypeOptions: true,
    // `X-Powered-By` n'a qu'un réglage : celui d'Express, dans `creerApplication`.
    xPoweredBy: false,
  });
}

const repondreSante: RequestHandler = (_requete, reponse) => {
  const corps: ReponseSante = { etat: "ok" };
  reponse.json(corps);
};

// Le délai de la sonde appartient à `@notionlike/db` ; toute erreur qui n'est pas la sienne suit
// le gestionnaire d'erreurs.
function repondrePret(base: Base, journal: Journal): RequestHandler {
  return async (_requete, reponse) => {
    try {
      await base.sonder();
    } catch (erreur) {
      if (!(erreur instanceof ErreurBase)) {
        throw erreur;
      }
      journal.baseIndisponible(idRequeteDe(reponse), erreur.code);
      envoyerErreur(reponse, "base-indisponible");
      return;
    }
    const corps: ReponsePret = { etat: "pret" };
    reponse.json(corps);
  };
}

// Chaque application a ses compteurs de débit (F-009 H12) : ceux du plafond global et ceux que
// better-auth tient par route.
function monterLAuthentification(application: Express, dependances: Dependances): void {
  const { configuration, journal } = dependances;
  const consommer = creerCompteurs();
  monterLesComptes(application, {
    authentification: creerAuthentification({ ...dependances, consommer }),
    journal,
    consommer,
    proxysDeConfiance: configuration.proxysDeConfiance,
    urlPublique: configuration.urlPublique,
  });
}

// F-009-AC32 : aucune réponse ne porte d'en-tête `Access-Control-Allow-*`, et aucune requête de
// pré-vérification n'est traitée. `ORIGINES_AUTORISEES` ne sert qu'au contrôle d'`Origin`.
export function creerApplication(dependances: Dependances): Express {
  const { base, journal } = dependances;
  const application = express();
  application.disable("x-powered-by");
  application.disable("etag");
  application.enable("strict routing");
  application.enable("case sensitive routing");
  application.use(identifierLaRequete);
  application.use(journaliserLaReponse(journal));
  application.use(poserLesEnTetesDeSecurite());
  monterLAuthentification(application, dependances);
  // F-008-AC6 : un corps compressé est décompressé, et la limite vaut pour le corps décompressé ;
  // un jeu de caractères autre qu'UTF ou un encodage inconnu est refusé par le lecteur (415), que
  // le gestionnaire d'erreurs rend en 400 `requete-invalide`.
  application.use(
    express.json({
      limit: LIMITE_CORPS_OCTETS,
      inflate: true,
      strict: true,
      type: "application/json",
    }),
  );
  application.get(CHEMINS.sante, repondreSante);
  application.get(CHEMINS.pret, repondrePret(base, journal));
  application.use(repondreIntrouvable);
  application.use(creerGestionnaireDErreurs(journal));
  return application;
}
