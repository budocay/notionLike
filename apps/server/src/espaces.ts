// Routes des espaces, des membres et des invitations (F-011). Toute route est protégée ; sur une
// route d'espace, l'ordre est fixe (F-011-AC9) : session, origine, adhésion, rôle, corps, puis état
// des données. Les refus sont écrits par l'enveloppe, jamais levés (D-014).
import { randomBytes } from "node:crypto";

import {
  CHEMINS_ESPACES,
  FORME_DU_JETON,
  QUOTAS,
  schemaCorpsAcceptation,
  schemaCorpsChangementDeRole,
  schemaCorpsCreationEspace,
  schemaCorpsCreationInvitation,
  schemaCorpsRenommage,
  schemaEspace,
  schemaInvitationCreee,
  schemaListeEspaces,
  schemaListeInvitations,
  schemaListeMembres,
  schemaListeMembresVueParUnProprietaire,
  schemaMembreVuParUnProprietaire,
  type Action,
  type Methode,
} from "@notionlike/contrats";
import {
  creerInvitation,
  listerEspaces,
  listerInvitationsEnAttente,
  listerMembres,
  renommerEspace,
  revoquerInvitation,
  type Base,
  type EspaceDuMembre,
  type InvitationLue,
} from "@notionlike/db";
import express, { type Express, type Request, type RequestHandler, type Response } from "express";
import type { z } from "zod";

import type { Adhesions } from "./adhesions.ts";
import { decider } from "./autorisation.ts";
import {
  compteDeLaSession,
  corpsJsonDe,
  type CompteConnecte,
  type DependancesDeSession,
} from "./comptes.ts";
import type { Consommer } from "./debit.ts";
import { envoyerErreur, idRequeteDe, LIMITE_CORPS_OCTETS } from "./enveloppe.ts";
import type { TypeDEvenementDEspace } from "./journal.ts";

// F-011-AC19, H13 : 32 octets du générateur cryptographique, en base64url sans remplissage.
const OCTETS_DU_JETON = 32;
const JOUR_MS = 86_400_000;
const JOURS_DE_VALIDITE = 7;
// F-011-AC25 : par compte, réussies ou non.
const PLAFOND_DES_ACCEPTATIONS = { fenetreS: 60, max: 10 };
const METHODES_QUI_ECRIVENT: readonly string[] = ["POST", "PATCH", "DELETE"];
const UUID_CANONIQUE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const STATUT_OK = 200;
const STATUT_CREE = 201;
const STATUT_SANS_CONTENU = 204;

const MONTEURS = { GET: "get", POST: "post", PATCH: "patch", DELETE: "delete" } as const;

export interface DependancesDesEspaces extends DependancesDeSession {
  readonly base: Base;
  readonly adhesions: Adhesions;
  // Les compteurs du plafond d'acceptation (F-011 H11).
  readonly consommer: Consommer;
  readonly horloge: () => Date;
  readonly urlPublique: string;
  readonly originesAutorisees: readonly string[];
}

interface Contexte {
  readonly requete: Request;
  readonly reponse: Response;
  readonly compte: CompteConnecte;
  readonly idRequete: string;
}

interface ContexteDEspace extends Contexte {
  readonly idEspace: string;
  readonly adhesion: EspaceDuMembre;
}

interface RouteDEspace {
  readonly methode: Methode;
  readonly chemin: string;
  // Les actions de la matrice que la route peut exercer ; `action` choisit celle de la requête.
  readonly actions: readonly Action[];
  readonly action: (requete: Request, compte: CompteConnecte) => Action;
  readonly traiter: (
    contexte: ContexteDEspace,
    dependances: DependancesDesEspaces,
  ) => Promise<void>;
}

export function tirerUnJeton(): string {
  return randomBytes(OCTETS_DU_JETON).toString("base64url");
}

function parametre(requete: Request, nom: string): string {
  const valeur: unknown = requete.params[nom];
  return typeof valeur === "string" ? valeur : "";
}

// Un identifiant venu du chemin n'est journalisé que s'il a la forme d'un identifiant.
function siIdentifiant(valeur: string): string | undefined {
  return UUID_CANONIQUE.test(valeur) ? valeur : undefined;
}

// F-011-AC26 : une écriture dont l'origine n'est ni l'URL publique ni une origine autorisée est
// refusée ; une requête sans `Origin` (client hors navigateur) n'en annonce aucune.
function origineAdmise(dependances: DependancesDesEspaces, requete: Request): boolean {
  const origine = requete.get("Origin");
  return (
    !METHODES_QUI_ECRIVENT.includes(requete.method) ||
    origine === undefined ||
    origine === dependances.urlPublique ||
    dependances.originesAutorisees.includes(origine)
  );
}

// Session (F-011-AC8) puis origine (AC26) ; `undefined` : la réponse est déjà écrite.
async function accueillir(
  dependances: DependancesDesEspaces,
  requete: Request,
  reponse: Response,
): Promise<Contexte | undefined> {
  const compte = await compteDeLaSession(dependances, requete, reponse);
  if (compte === undefined) {
    return undefined;
  }
  if (!origineAdmise(dependances, requete)) {
    envoyerErreur(reponse, "origine-refusee");
    return undefined;
  }
  return { requete, reponse, compte, idRequete: idRequeteDe(reponse) };
}

// F-011-AC27 : un corps hors du schéma strict de la route reçoit 400 ; seuls les champs que le
// schéma nomme sont rendus.
function corpsSelon<T>(schema: z.ZodType<T>, { requete, reponse }: Contexte): T | undefined {
  const lu = schema.safeParse(corpsJsonDe(requete));
  if (!lu.success) {
    envoyerErreur(reponse, "requete-invalide");
    return undefined;
  }
  return lu.data;
}

// Toute réponse passe par le schéma publié : un champ de trop lève, et sort en 500.
function repondre<T>(reponse: Response, statut: number, schema: z.ZodType<T>, corps: T): void {
  reponse.status(statut).json(schema.parse(corps));
}

function journaliser(
  { journal }: DependancesDesEspaces,
  contexte: Contexte,
  type: TypeDEvenementDEspace,
  idEspace: string,
  idCompteVise?: string,
): void {
  journal.evenementDEspace({
    type,
    idRequete: contexte.idRequete,
    idCompte: contexte.compte.id,
    idEspace,
    idCompteVise,
  });
}

function versLeContrat(invitation: InvitationLue) {
  return {
    idInvitation: invitation.idInvitation,
    role: invitation.role,
    creeLe: invitation.creeLe.toISOString(),
    expireLe: invitation.expireLe.toISOString(),
  };
}

const ROUTES_D_ESPACE: readonly RouteDEspace[] = [
  {
    methode: "GET",
    chemin: CHEMINS_ESPACES.espace,
    actions: ["lire-espace"],
    action: () => "lire-espace",
    traiter: ({ reponse, adhesion }) => {
      repondre(reponse, STATUT_OK, schemaEspace, adhesion);
      return Promise.resolve();
    },
  },
  {
    methode: "PATCH",
    chemin: CHEMINS_ESPACES.espace,
    actions: ["renommer-espace"],
    action: () => "renommer-espace",
    traiter: async (contexte, { base }) => {
      const corps = corpsSelon(schemaCorpsRenommage, contexte);
      if (corps === undefined) {
        return;
      }
      const renomme = await renommerEspace(base.db, contexte.idEspace, corps.nom);
      if (renomme === undefined) {
        envoyerErreur(contexte.reponse, "ressource-introuvable");
        return;
      }
      repondre(contexte.reponse, STATUT_OK, schemaEspace, {
        ...renomme,
        role: contexte.adhesion.role,
      });
    },
  },
  {
    methode: "DELETE",
    chemin: CHEMINS_ESPACES.espace,
    actions: ["supprimer-espace"],
    action: () => "supprimer-espace",
    traiter: async (contexte, dependances) => {
      const supprimees = await dependances.adhesions.supprimerEspace(contexte.idEspace);
      if (supprimees === undefined) {
        envoyerErreur(contexte.reponse, "ressource-introuvable");
        return;
      }
      journaliser(dependances, contexte, "espace-supprime", contexte.idEspace);
      contexte.reponse.status(STATUT_SANS_CONTENU).end();
    },
  },
  {
    methode: "GET",
    chemin: CHEMINS_ESPACES.membres,
    actions: ["lister-membres"],
    action: () => "lister-membres",
    traiter: async ({ reponse, idEspace, adhesion }, { base }) => {
      // F-011-AC14, H7 : le courriel n'est lu que pour un propriétaire.
      const avecCourriel = adhesion.role === "proprietaire";
      const membres = await listerMembres(base.db, idEspace, { avecCourriel });
      if (avecCourriel) {
        repondre(reponse, STATUT_OK, schemaListeMembresVueParUnProprietaire, {
          membres: membres.map(({ courriel = "", ...membre }) => ({ ...membre, courriel })),
        });
      } else {
        repondre(reponse, STATUT_OK, schemaListeMembres, { membres });
      }
    },
  },
  {
    methode: "PATCH",
    chemin: CHEMINS_ESPACES.membre,
    actions: ["changer-role"],
    action: () => "changer-role",
    traiter: async (contexte, dependances) => {
      const corps = corpsSelon(schemaCorpsChangementDeRole, contexte);
      if (corps === undefined) {
        return;
      }
      const idCompte = parametre(contexte.requete, "idCompte");
      const issue = await dependances.adhesions.changerRole({
        idEspace: contexte.idEspace,
        idCompte,
        role: corps.role,
      });
      if (issue.issue !== "fait") {
        envoyerErreur(
          contexte.reponse,
          issue.issue === "dernier-proprietaire" ? issue.issue : "ressource-introuvable",
        );
        return;
      }
      journaliser(dependances, contexte, "role-change", contexte.idEspace, idCompte);
      const { courriel = "", ...membre } = issue.membre;
      repondre(contexte.reponse, STATUT_OK, schemaMembreVuParUnProprietaire, {
        ...membre,
        courriel,
      });
    },
  },
  {
    methode: "DELETE",
    chemin: CHEMINS_ESPACES.membre,
    // F-011-AC16, AC18 : se retirer soi-même, c'est quitter l'espace.
    actions: ["retirer-membre", "quitter-espace"],
    action: (requete, compte) =>
      parametre(requete, "idCompte") === compte.id ? "quitter-espace" : "retirer-membre",
    traiter: async (contexte, dependances) => {
      const idCompte = parametre(contexte.requete, "idCompte");
      const issue = await dependances.adhesions.retirerMembre({
        idEspace: contexte.idEspace,
        idCompte,
      });
      if (issue.issue !== "fait") {
        envoyerErreur(
          contexte.reponse,
          issue.issue === "dernier-proprietaire" ? issue.issue : "ressource-introuvable",
        );
        return;
      }
      journaliser(dependances, contexte, "membre-retire", contexte.idEspace, idCompte);
      contexte.reponse.status(STATUT_SANS_CONTENU).end();
    },
  },
  {
    methode: "POST",
    chemin: CHEMINS_ESPACES.invitations,
    actions: ["inviter"],
    action: () => "inviter",
    traiter: async (contexte, dependances) => {
      const corps = corpsSelon(schemaCorpsCreationInvitation, contexte);
      if (corps === undefined) {
        return;
      }
      const jeton = tirerUnJeton();
      const creeLe = dependances.horloge();
      const issue = await creerInvitation(dependances.base.db, {
        idEspace: contexte.idEspace,
        role: corps.role,
        jeton,
        creeLe,
        expireLe: new Date(creeLe.getTime() + JOURS_DE_VALIDITE * JOUR_MS),
        plafondInvitationsEnAttente: QUOTAS.invitationsEnAttenteParEspace,
      });
      if (issue.issue !== "creee") {
        envoyerErreur(
          contexte.reponse,
          issue.issue === "quota-atteint" ? issue.issue : "ressource-introuvable",
        );
        return;
      }
      journaliser(dependances, contexte, "invitation-creee", contexte.idEspace);
      const { idInvitation, role, expireLe } = issue.invitation;
      repondre(contexte.reponse, STATUT_CREE, schemaInvitationCreee, {
        idInvitation,
        role,
        expireLe: expireLe.toISOString(),
        jeton,
      });
    },
  },
  {
    methode: "GET",
    chemin: CHEMINS_ESPACES.invitations,
    actions: ["inviter"],
    action: () => "inviter",
    traiter: async ({ reponse, idEspace }, { base, horloge }) => {
      const invitations = await listerInvitationsEnAttente(base.db, idEspace, horloge());
      repondre(reponse, STATUT_OK, schemaListeInvitations, {
        invitations: invitations.map(versLeContrat),
      });
    },
  },
  {
    methode: "DELETE",
    chemin: CHEMINS_ESPACES.invitation,
    actions: ["inviter"],
    action: () => "inviter",
    traiter: async (contexte, dependances) => {
      const revoquee = await revoquerInvitation(dependances.base.db, {
        idEspace: contexte.idEspace,
        idInvitation: parametre(contexte.requete, "idInvitation"),
        maintenant: dependances.horloge(),
      });
      if (revoquee === undefined) {
        envoyerErreur(contexte.reponse, "ressource-introuvable");
        return;
      }
      journaliser(dependances, contexte, "invitation-revoquee", contexte.idEspace);
      contexte.reponse.status(STATUT_SANS_CONTENU).end();
    },
  },
];

// F-011-AC32 : les actions de chaque route d'espace, par couple méthode et chemin.
export const ACTIONS_DES_ROUTES_D_ESPACE: ReadonlyMap<string, readonly Action[]> = new Map(
  ROUTES_D_ESPACE.map(({ methode, chemin, actions }) => [`${methode} ${chemin}`, actions]),
);

// Adhésion (F-011-AC12), puis rôle (AC11), puis la route : corps (AC27) et état des données.
function traiterUneRouteDEspace(
  route: RouteDEspace,
  dependances: DependancesDesEspaces,
): RequestHandler {
  return async (requete, reponse) => {
    const contexte = await accueillir(dependances, requete, reponse);
    if (contexte === undefined) {
      return;
    }
    const idEspace = parametre(requete, "idEspace");
    const decision = await decider(dependances.base, {
      idEspace,
      idCompte: contexte.compte.id,
      action: route.action(requete, contexte.compte),
    });
    if (decision.issue === "introuvable") {
      envoyerErreur(reponse, "ressource-introuvable");
      return;
    }
    if (decision.issue === "refusee") {
      const vise = siIdentifiant(parametre(requete, "idCompte"));
      journaliser(dependances, contexte, "action-refusee", idEspace, vise);
      envoyerErreur(reponse, "acces-refuse");
      return;
    }
    await route.traiter({ ...contexte, idEspace, adhesion: decision.adhesion }, dependances);
  };
}

function creerUnEspace(dependances: DependancesDesEspaces): RequestHandler {
  return async (requete, reponse) => {
    const contexte = await accueillir(dependances, requete, reponse);
    const corps = contexte && corpsSelon(schemaCorpsCreationEspace, contexte);
    if (contexte === undefined || corps === undefined) {
      return;
    }
    const issue = await dependances.adhesions.creerEspace({
      ...corps,
      idCompte: contexte.compte.id,
      plafondEspacesPossedes: QUOTAS.espacesPossedesParCompte,
    });
    if (issue.issue === "cree") {
      journaliser(dependances, contexte, "espace-cree", issue.espace.idEspace);
      repondre(reponse, STATUT_CREE, schemaEspace, issue.espace);
    } else if (issue.issue === "existant") {
      repondre(reponse, STATUT_OK, schemaEspace, issue.espace);
    } else {
      envoyerErreur(reponse, issue.issue);
    }
  };
}

function listerLesEspaces(dependances: DependancesDesEspaces): RequestHandler {
  return async (requete, reponse) => {
    const contexte = await accueillir(dependances, requete, reponse);
    if (contexte === undefined) {
      return;
    }
    const espaces = await listerEspaces(dependances.base.db, contexte.compte.id);
    repondre(reponse, STATUT_OK, schemaListeEspaces, { espaces });
  };
}

// Session, origine, plafond (F-011-AC25), corps (AC27), forme du jeton (AC22), puis la base.
function accepterUneInvitation(dependances: DependancesDesEspaces): RequestHandler {
  return async (requete, reponse) => {
    const contexte = await accueillir(dependances, requete, reponse);
    if (contexte === undefined) {
      return;
    }
    const cle = `acceptation|${contexte.compte.id}`;
    const { permise, attenteS } = dependances.consommer(cle, PLAFOND_DES_ACCEPTATIONS);
    if (!permise) {
      reponse.set("Retry-After", String(attenteS));
      envoyerErreur(reponse, "trop-de-requetes");
      return;
    }
    const corps = corpsSelon(schemaCorpsAcceptation, contexte);
    if (corps === undefined) {
      return;
    }
    if (!FORME_DU_JETON.test(corps.jeton)) {
      envoyerErreur(reponse, "invitation-invalide");
      return;
    }
    const issue = await dependances.adhesions.accepterInvitation({
      jeton: corps.jeton,
      idCompte: contexte.compte.id,
      maintenant: dependances.horloge(),
      plafondMembres: QUOTAS.membresParEspace,
    });
    if (issue.issue !== "acceptee") {
      envoyerErreur(reponse, issue.issue);
      return;
    }
    journaliser(dependances, contexte, "invitation-acceptee", issue.espace.idEspace);
    repondre(reponse, STATUT_OK, schemaEspace, issue.espace);
  };
}

export function monterLesEspaces(application: Express, dependances: DependancesDesEspaces): void {
  // Le corps est lu ici, quel que soit son type annoncé : la limite de F-008-AC6 vaut pour toutes
  // ces routes, et un corps illisible est refusé après l'autorisation, jamais avant (F-011-AC12).
  const lireLeCorps = express.raw({ limit: LIMITE_CORPS_OCTETS, type: () => true });
  application.post(CHEMINS_ESPACES.espaces, lireLeCorps, creerUnEspace(dependances));
  application.get(CHEMINS_ESPACES.espaces, lireLeCorps, listerLesEspaces(dependances));
  application.post(CHEMINS_ESPACES.acceptation, lireLeCorps, accepterUneInvitation(dependances));
  for (const route of ROUTES_D_ESPACE) {
    application[MONTEURS[route.methode]](
      route.chemin,
      lireLeCorps,
      traiterUneRouteDEspace(route, dependances),
    );
  }
}
