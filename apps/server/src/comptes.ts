// Routes des comptes (F-009). Tout ce qui précède better-auth est ici : plafond global, liste
// fermée des routes, taille et forme du corps, adresse de la requête. better-auth ne reçoit qu'une
// requête reconstruite sur l'URL publique, avec une liste fermée d'en-têtes (F-009-AC15, AC30).
import {
  CHEMINS_COMPTES,
  schemaCompte,
  schemaCompteNatif,
  schemaCorpsConnexion,
  schemaCorpsInscription,
} from "@notionlike/contrats";
import express, { type Express, type Request, type RequestHandler, type Response } from "express";
import { z } from "zod";

import { adresseDe, reseauDe } from "./adresse.ts";
import type { Authentification, Traitement } from "./authentification.ts";
import type { Consommer } from "./debit.ts";
import { envoyerErreur, idRequeteDe, LIMITE_CORPS_OCTETS } from "./enveloppe.ts";
import type { CodeDEchec, Journal, TypeDEvenement } from "./journal.ts";

const PREFIXE = "/api/auth";
const PLAFOND_GLOBAL = { fenetreS: 60, max: 60 };
const STATUT_OK = 200;
const STATUT_TROP_DE_REQUETES = 429;
const STATUT_NON_AUTHENTIFIE = 401;
const PREMIER_STATUT_SERVEUR = 500;
const ATTENTE_MAX_S = 60;

// Les seuls en-têtes de la requête que better-auth reçoit. `Authorization`, `Host` et les
// `X-Forwarded-*` du client n'en sont pas (F-009-AC29, AC30).
const EN_TETES_TRANSMIS = [
  "cookie",
  "origin",
  "referer",
  "user-agent",
  "sec-fetch-site",
  "sec-fetch-mode",
  "sec-fetch-dest",
];

type Route = "inscription" | "connexion" | "deconnexion" | "session";

// F-009-AC17 : la liste fermée des routes d'authentification ouvertes.
const METHODES: Readonly<Record<Route, "GET" | "POST">> = {
  inscription: "POST",
  connexion: "POST",
  deconnexion: "POST",
  session: "GET",
};
const ROUTES = Object.keys(METHODES) as Route[];

const SCHEMAS_DES_CORPS = {
  inscription: schemaCorpsInscription,
  connexion: schemaCorpsConnexion,
  deconnexion: undefined,
  session: undefined,
};

const schemaCorpsAvecCompte = z.object({ user: schemaCompteNatif });

const ECHEC_PAR_DEFAUT: CodeDEchec = "authentification-en-echec";

interface Recue {
  readonly idRequete: string;
  readonly adresse: string;
}

type Supprimees = Traitement["supprimees"];

interface Dependances {
  readonly authentification: Authentification;
  readonly journal: Journal;
  readonly consommer: Consommer;
  readonly proxysDeConfiance: number;
  readonly urlPublique: string;
}

function viseLAuthentification(chemin: string): boolean {
  return chemin === PREFIXE || chemin.startsWith(`${PREFIXE}/`);
}

// F-009-AC31 : toute requête sous /api/auth/ est comptée, ouverte ou non, avant tout traitement.
function plafonnerLeDebit({ consommer, journal, proxysDeConfiance }: Dependances): RequestHandler {
  return (requete, reponse, suivant) => {
    if (!viseLAuthentification(requete.path)) {
      suivant();
      return;
    }
    const adresse = adresseDe(requete, proxysDeConfiance);
    const { permise, attenteS } = consommer(`global|${reseauDe(adresse)}`, PLAFOND_GLOBAL);
    if (permise) {
      suivant();
      return;
    }
    journal.evenementDeCompte({
      type: "debit-depasse",
      idRequete: idRequeteDe(reponse),
      adresse,
    });
    reponse.set("Retry-After", String(attenteS));
    envoyerErreur(reponse, "trop-de-requetes");
  };
}

// F-009-AC17 : hors des quatre couples méthode et chemin, comparés à l'identique, rien n'atteint
// better-auth.
const fermerLesAutresRoutes: RequestHandler = (requete, reponse, suivant) => {
  const ouverte = ROUTES.some(
    (route) => METHODES[route] === requete.method && CHEMINS_COMPTES[route] === requete.path,
  );
  if (viseLAuthentification(requete.path) && !ouverte) {
    envoyerErreur(reponse, "ressource-introuvable");
    return;
  }
  suivant();
};

// Le corps lu par `express.raw`, s'il est annoncé en JSON et lisible comme tel.
function corpsJsonDe(requete: Request): unknown {
  if (!Buffer.isBuffer(requete.body) || requete.is("application/json") !== "application/json") {
    return undefined;
  }
  try {
    return JSON.parse(requete.body.toString("utf8")) as unknown;
  } catch {
    return undefined;
  }
}

// `X-Forwarded-For` est remplacé par l'adresse retenue (F-009-AC15). better-auth ne contrôle
// `Origin` que si la requête porte un en-tête `Cookie` : une requête qui annonce une origine
// reçoit donc toujours cet en-tête, vide à défaut, pour que le contrôle ait lieu (F-009-AC16).
function enTetesPourBetterAuth(requete: Request, adresse: string): Headers {
  const enTetes = new Headers({ "x-forwarded-for": adresse });
  for (const nom of EN_TETES_TRANSMIS) {
    const valeur = requete.get(nom);
    if (valeur !== undefined) {
      enTetes.set(nom, valeur);
    }
  }
  if (enTetes.has("origin") && !enTetes.has("cookie")) {
    enTetes.set("cookie", "");
  }
  return enTetes;
}

function evenementDe(
  route: Route,
  statut: number,
  sessionSupprimee: boolean,
): TypeDEvenement | undefined {
  if (statut === STATUT_TROP_DE_REQUETES) {
    return "debit-depasse";
  }
  if (route === "connexion" && statut === STATUT_NON_AUTHENTIFIE) {
    return "connexion-refusee";
  }
  const reussites = {
    inscription: "inscription",
    connexion: "connexion",
    deconnexion: sessionSupprimee ? "deconnexion" : undefined,
    session: undefined,
  } as const;
  return statut === STATUT_OK ? reussites[route] : undefined;
}

function idCompteDe(texte: string): string | undefined {
  try {
    return schemaCorpsAvecCompte.safeParse(JSON.parse(texte)).data?.user.id;
  } catch {
    return undefined;
  }
}

// F-009-AC14 : better-auth n'émet que `X-Retry-After` ; l'en-tête standard est ajouté ici.
function attenteDe(native: globalThis.Response): string {
  const annoncee = Number(native.headers.get("X-Retry-After"));
  const bornee = Number.isFinite(annoncee)
    ? Math.min(Math.max(Math.ceil(annoncee), 1), ATTENTE_MAX_S)
    : ATTENTE_MAX_S;
  return String(bornee);
}

function poserLesCookies(reponse: Response, enTetes: Headers): void {
  for (const cookie of enTetes.getSetCookie()) {
    reponse.append("Set-Cookie", cookie);
  }
}

// La réponse native, telle quelle : statut, type, cookies et corps (H2).
function recopier(reponse: Response, native: globalThis.Response, texte: string): void {
  poserLesCookies(reponse, native.headers);
  if (native.status === STATUT_TROP_DE_REQUETES) {
    reponse.set("Retry-After", attenteDe(native));
  }
  reponse
    .status(native.status)
    .type(native.headers.get("Content-Type") ?? "application/json")
    .send(texte);
}

// La requête que better-auth reçoit ; `undefined` : le corps manque ou sort de son schéma, que
// better-auth ne voit donc jamais (F-009-AC4).
function requeteNative(
  route: Route,
  requete: Request,
  adresse: string,
  urlPublique: string,
): globalThis.Request | undefined {
  const corps = SCHEMAS_DES_CORPS[route]?.safeParse(corpsJsonDe(requete));
  if (corps?.success === false) {
    return undefined;
  }
  const enTetes = enTetesPourBetterAuth(requete, adresse);
  if (corps !== undefined) {
    enTetes.set("content-type", "application/json");
  }
  return new globalThis.Request(`${urlPublique}${CHEMINS_COMPTES[route]}`, {
    method: METHODES[route],
    headers: enTetes,
    body: corps === undefined ? null : JSON.stringify(corps.data),
  });
}

// F-009-AC20, AC26 : une erreur non prévue, ou une session que la base n'a pas supprimée alors que
// better-auth annonce un succès. Dans ce second cas, le cookie que better-auth efface est gardé.
function echecDe(traitement: Traitement): { code: CodeDEchec; erreur: unknown } | undefined {
  if ("suppressionEnEchec" in traitement) {
    return { code: "session-non-supprimee", erreur: traitement.suppressionEnEchec };
  }
  const statut = traitement.reponse?.status ?? PREMIER_STATUT_SERVEUR;
  return statut >= PREMIER_STATUT_SERVEUR
    ? { code: "authentification-en-echec", erreur: traitement.erreur }
    : undefined;
}

function transmettre(route: Route, dependances: Dependances): RequestHandler {
  const { authentification, journal, proxysDeConfiance, urlPublique } = dependances;

  // H2 : la réponse de better-auth est rendue telle quelle, après la ligne de journal de F-009-AC19.
  async function rendre(native: globalThis.Response, recue: Recue, supprimees: Supprimees) {
    const texte = await native.text();
    const type = evenementDe(route, native.status, supprimees.length > 0);
    if (type !== undefined) {
      const idCompte = supprimees[0]?.idCompte ?? idCompteDe(texte);
      journal.evenementDeCompte({ type, idCompte, ...recue });
    }
    return texte;
  }

  return async (requete, reponse) => {
    const recue = {
      idRequete: idRequeteDe(reponse),
      adresse: adresseDe(requete, proxysDeConfiance),
    };
    const native = requeteNative(route, requete, recue.adresse, urlPublique);
    if (native === undefined) {
      envoyerErreur(reponse, "requete-invalide");
      return;
    }
    const traitement = await authentification.traiter(native);
    const echec = echecDe(traitement);
    if (echec !== undefined || traitement.reponse === undefined) {
      journal.echecSansDonnee(echec?.code ?? ECHEC_PAR_DEFAUT, echec?.erreur, recue.idRequete);
      poserLesCookies(reponse, traitement.reponse?.headers ?? new Headers());
      envoyerErreur(reponse, "erreur-interne");
      return;
    }
    const texte = await rendre(traitement.reponse, recue, traitement.supprimees);
    recopier(reponse, traitement.reponse, texte);
  };
}

// F-009-AC10, AC11, AC20 : la session est lue en base à chaque requête ; sans session valide, ou
// si la lecture échoue, le traitement de la route n'a pas lieu.
function repondreMoi({
  authentification,
  journal,
  proxysDeConfiance,
}: Dependances): RequestHandler {
  return async (requete, reponse) => {
    const enTetes = enTetesPourBetterAuth(requete, adresseDe(requete, proxysDeConfiance));
    const lue = await authentification
      .lireLaSession(enTetes)
      .catch((erreur: unknown) => ({ erreur }));
    if (lue !== undefined && "erreur" in lue) {
      journal.echecSansDonnee("verification-de-session-en-echec", lue.erreur, idRequeteDe(reponse));
      envoyerErreur(reponse, "erreur-interne");
      return;
    }
    if (lue === undefined) {
      envoyerErreur(reponse, "non-authentifie");
      return;
    }
    const { id, name, email } = lue.compte;
    poserLesCookies(reponse, lue.enTetes);
    reponse.json(schemaCompte.parse({ id, nom: name, courriel: email }));
  };
}

export function monterLesComptes(application: Express, dependances: Dependances): void {
  // Le corps d'une route d'authentification est lu ici, quel que soit son type annoncé, pour que
  // la limite de taille vaille pour tous (F-009-AC28).
  const lireLeCorps = express.raw({ limit: LIMITE_CORPS_OCTETS, type: () => true });
  application.use(plafonnerLeDebit(dependances));
  application.use(fermerLesAutresRoutes);
  for (const route of ROUTES) {
    const transmission = transmettre(route, dependances);
    if (METHODES[route] === "POST") {
      application.post(CHEMINS_COMPTES[route], lireLeCorps, transmission);
    } else {
      application.get(CHEMINS_COMPTES[route], transmission);
    }
  }
  application.get(CHEMINS_COMPTES.moi, repondreMoi(dependances));
}
