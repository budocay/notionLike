// Composition de l'application (ADR-0004). Elle reçoit ses dépendances, n'écoute pas et ne lit
// pas `process`. L'ordre des étapes est fixe.
import { CHEMINS, type ReponsePret, type ReponseSante } from "@notionlike/contrats";
import { ErreurBase, type Base } from "@notionlike/db";
import express, { type Express, type RequestHandler } from "express";
import helmet from "helmet";

import type { Configuration } from "./configuration.ts";
import {
  creerGestionnaireDErreurs,
  envoyerErreur,
  identifierLaRequete,
  idRequeteDe,
  repondreIntrouvable,
} from "./enveloppe.ts";
import type { Journal } from "./journal.ts";

const LIMITE_CORPS_OCTETS = 100_000;

interface Dependances {
  readonly configuration: Configuration;
  readonly base: Base;
  readonly journal: Journal;
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

function autoriserLesOrigines(autorisees: readonly string[]): RequestHandler {
  return (requete, reponse, suivant) => {
    const origine = requete.get("Origin");
    reponse.vary("Origin");
    if (origine !== undefined && autorisees.includes(origine)) {
      reponse.set("Access-Control-Allow-Origin", origine);
      reponse.set("Access-Control-Allow-Credentials", "true");
    }
    suivant();
  };
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

export function creerApplication({ configuration, base, journal }: Dependances): Express {
  const application = express();
  application.disable("x-powered-by");
  application.disable("etag");
  application.enable("strict routing");
  application.enable("case sensitive routing");
  application.use(identifierLaRequete);
  application.use(journaliserLaReponse(journal));
  application.use(poserLesEnTetesDeSecurite());
  application.use(autoriserLesOrigines(configuration.originesAutorisees));
  application.use(
    express.json({ limit: LIMITE_CORPS_OCTETS, strict: true, type: "application/json" }),
  );
  application.get(CHEMINS.sante, repondreSante);
  application.get(CHEMINS.pret, repondrePret(base, journal));
  application.use(repondreIntrouvable);
  application.use(creerGestionnaireDErreurs(journal));
  return application;
}
