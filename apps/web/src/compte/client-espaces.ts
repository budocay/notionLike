// Client des espaces (F-014-AC37) : seul module d'apps/web qui appelle les douze routes de F-011.
// Chaque appel rend un succès validé contre le schéma strict du contrat, ou une erreur classée
// (code de l'enveloppe, 429 et son délai, réseau, réponse non conforme) ; aucune exception n'en
// sort (F-014-AC31). Les chemins, les schémas des corps et des réponses viennent de
// `packages/contrats` (F-014-AC39). La session voyage par son seul cookie (F-014-AC34).
import {
  CHEMINS_ESPACES,
  type CodeErreur,
  type CorpsAcceptation,
  type CorpsChangementDeRole,
  type CorpsCreationEspace,
  type CorpsCreationInvitation,
  type CorpsRenommage,
  type Espace,
  type Invitation,
  type InvitationCreee,
  schemaCorpsAcceptation,
  schemaCorpsChangementDeRole,
  schemaCorpsCreationEspace,
  schemaCorpsCreationInvitation,
  schemaCorpsRenommage,
  schemaEnveloppeErreur,
  schemaEspace,
  schemaInvitationCreee,
  schemaListeEspaces,
  schemaListeInvitations,
  schemaListeMembres,
  schemaListeMembresVueParUnProprietaire,
} from "@notionlike/contrats";
import { delaiDeRetryAfter } from "./client-auth.ts";
import { avecDelai, DELAI_DE_REPONSE_MS, type Requeter } from "./moi.ts";

export type ErreurDEspaces =
  | { readonly type: "enveloppe"; readonly code: CodeErreur; readonly idRequete: string }
  | { readonly type: "trop-de-requetes"; readonly delaiSecondes: number }
  | { readonly type: "hors-ligne" }
  | { readonly type: "generique" };

export type Resultat<T> =
  | { readonly ok: true; readonly valeur: T }
  | { readonly ok: false; readonly erreur: ErreurDEspaces };

export type EspaceLu = Espace;
export type InvitationCreeeLue = InvitationCreee;
export type InvitationLue = Invitation;

/** Un membre, avec son courriel seulement quand la réponse le porte (F-011-AC14). */
export interface MembreLu {
  readonly idCompte: string;
  readonly nom: string;
  readonly role: EspaceLu["role"];
  readonly courriel?: string | undefined;
}

export interface ClientDesEspaces {
  readonly listerEspaces: () => Promise<Resultat<readonly EspaceLu[]>>;
  readonly creerEspace: (corps: CorpsCreationEspace) => Promise<Resultat<EspaceLu>>;
  /**
   * Déclaration de l'espace local (F-013-AC12) : la création, ou sa réponse rejouée (200,
   * F-011-AC2), que `rejouee` distingue.
   */
  readonly declarerEspace: (
    corps: CorpsCreationEspace,
  ) => Promise<Resultat<EspaceLu & { readonly rejouee: boolean }>>;
  readonly lireEspace: (idEspace: string) => Promise<Resultat<EspaceLu>>;
  readonly renommerEspace: (idEspace: string, corps: CorpsRenommage) => Promise<Resultat<EspaceLu>>;
  readonly supprimerEspace: (idEspace: string) => Promise<Resultat<null>>;
  readonly listerMembres: (idEspace: string) => Promise<Resultat<readonly MembreLu[]>>;
  readonly changerRole: (
    idEspace: string,
    idCompte: string,
    corps: CorpsChangementDeRole,
  ) => Promise<Resultat<MembreLu>>;
  readonly retirerMembre: (idEspace: string, idCompte: string) => Promise<Resultat<null>>;
  readonly creerInvitation: (
    idEspace: string,
    corps: CorpsCreationInvitation,
  ) => Promise<Resultat<InvitationCreeeLue>>;
  readonly listerInvitations: (idEspace: string) => Promise<Resultat<readonly InvitationLue[]>>;
  readonly revoquerInvitation: (idEspace: string, idInvitation: string) => Promise<Resultat<null>>;
  readonly accepterInvitation: (corps: CorpsAcceptation) => Promise<Resultat<EspaceLu>>;
}

const STATUT_TROP_DE_REQUETES = 429;
const SANS_CORPS = 204;
const HORS_LIGNE: ErreurDEspaces = { type: "hors-ligne" };
const GENERIQUE: ErreurDEspaces = { type: "generique" };

export interface Schema<T> {
  readonly safeParse: (valeur: unknown) => { success: true; data: T } | { success: false };
}

export interface Appel<T> {
  readonly methode: "GET" | "POST" | "PATCH" | "DELETE";
  readonly chemin: string;
  readonly corps?: { readonly valeur: unknown; readonly schema: Schema<unknown> } | undefined;
  /** Statut du succès attendu, et lecture de son corps. */
  readonly attendu: number;
  /** Un second statut de succès, lu par la même fonction (F-013-AC12 : création rejouée). */
  readonly aussi?: number | undefined;
  readonly lire: (corps: unknown, statut: number) => T | undefined;
}

/** Chemin du contrat, ses paramètres remplacés ; une valeur est toujours encodée. */
export function cheminDe(
  modele: string,
  parametres: Readonly<Record<string, string>> = {},
): string {
  return modele.replaceAll(/:(\w+)/g, (_, nom: string) =>
    encodeURIComponent(parametres[nom] ?? ""),
  );
}

export function lecteur<T>(schema: Schema<T>): (corps: unknown) => T | undefined {
  return (corps) => {
    const lu = schema.safeParse(corps);
    return lu.success ? lu.data : undefined;
  };
}

function lireMembres(corps: unknown): readonly MembreLu[] | undefined {
  return (
    lecteur(schemaListeMembresVueParUnProprietaire)(corps)?.membres ??
    lecteur(schemaListeMembres)(corps)?.membres
  );
}

function lireMembre(corps: unknown): MembreLu | undefined {
  return lireMembres({ membres: [corps] })?.[0];
}

const STATUTS = { lu: 200, cree: 201, vide: SANS_CORPS } as const;

export function creerClientDesEspaces(
  requeter: Requeter,
  delaiMs: number = DELAI_DE_REPONSE_MS,
): ClientDesEspaces {
  const envoyer = creerEnvoi(requeter, delaiMs);
  return {
    ...appelsDesEspaces(envoyer),
    ...appelsDesMembres(envoyer),
    ...appelsDesInvitations(envoyer),
  };
}

export type Envoyer = <T>(appel: Appel<T>) => Promise<Resultat<T>>;

/**
 * Envoi d'un appel : corps contrôlé, délai, réponse lue et classée. Partagé par le client des
 * espaces et celui de la gestion du compte (F-027-AC27), qui ont la même enveloppe et les mêmes
 * règles de lecture.
 */
export function creerEnvoi(requeter: Requeter, delaiMs: number = DELAI_DE_REPONSE_MS): Envoyer {
  return (appel) => executer(requeter, delaiMs, appel);
}

const lireEspace = lecteur(schemaEspace);
const vide = (): null => null;

function espace(idEspace: string): string {
  return cheminDe(CHEMINS_ESPACES.espace, { idEspace });
}

// F-013-AC12 : 201 pour une création, 200 pour une création rejouée (F-011-AC2), même corps.
function declaration(corps: CorpsCreationEspace): Appel<EspaceLu & { readonly rejouee: boolean }> {
  return {
    methode: "POST",
    chemin: CHEMINS_ESPACES.espaces,
    corps: { valeur: corps, schema: schemaCorpsCreationEspace },
    attendu: STATUTS.cree,
    aussi: STATUTS.lu,
    lire: (lu, statut) => {
      const espaceLu = lireEspace(lu);
      return espaceLu === undefined ? undefined : { ...espaceLu, rejouee: statut === STATUTS.lu };
    },
  };
}

function appelsDesEspaces(
  envoyer: Envoyer,
): Pick<
  ClientDesEspaces,
  | "listerEspaces"
  | "creerEspace"
  | "declarerEspace"
  | "lireEspace"
  | "renommerEspace"
  | "supprimerEspace"
> {
  return {
    listerEspaces: () =>
      envoyer({
        methode: "GET",
        chemin: CHEMINS_ESPACES.espaces,
        attendu: STATUTS.lu,
        lire: (corps) => lecteur(schemaListeEspaces)(corps)?.espaces,
      }),
    creerEspace: (corps) =>
      envoyer({
        methode: "POST",
        chemin: CHEMINS_ESPACES.espaces,
        corps: { valeur: corps, schema: schemaCorpsCreationEspace },
        attendu: STATUTS.cree,
        lire: lireEspace,
      }),
    declarerEspace: (corps) => envoyer(declaration(corps)),
    lireEspace: (idEspace) =>
      envoyer({ methode: "GET", chemin: espace(idEspace), attendu: STATUTS.lu, lire: lireEspace }),
    renommerEspace: (idEspace, corps) =>
      envoyer({
        methode: "PATCH",
        chemin: espace(idEspace),
        corps: { valeur: corps, schema: schemaCorpsRenommage },
        attendu: STATUTS.lu,
        lire: lireEspace,
      }),
    supprimerEspace: (idEspace) =>
      envoyer({ methode: "DELETE", chemin: espace(idEspace), attendu: STATUTS.vide, lire: vide }),
  };
}

function appelsDesMembres(
  envoyer: Envoyer,
): Pick<ClientDesEspaces, "listerMembres" | "changerRole" | "retirerMembre"> {
  const membre = (idEspace: string, idCompte: string): string =>
    cheminDe(CHEMINS_ESPACES.membre, { idEspace, idCompte });
  return {
    listerMembres: (idEspace) =>
      envoyer({
        methode: "GET",
        chemin: cheminDe(CHEMINS_ESPACES.membres, { idEspace }),
        attendu: STATUTS.lu,
        lire: lireMembres,
      }),
    changerRole: (idEspace, idCompte, corps) =>
      envoyer({
        methode: "PATCH",
        chemin: membre(idEspace, idCompte),
        corps: { valeur: corps, schema: schemaCorpsChangementDeRole },
        attendu: STATUTS.lu,
        lire: lireMembre,
      }),
    retirerMembre: (idEspace, idCompte) =>
      envoyer({
        methode: "DELETE",
        chemin: membre(idEspace, idCompte),
        attendu: STATUTS.vide,
        lire: vide,
      }),
  };
}

function appelsDesInvitations(
  envoyer: Envoyer,
): Pick<
  ClientDesEspaces,
  "creerInvitation" | "listerInvitations" | "revoquerInvitation" | "accepterInvitation"
> {
  const invitations = (idEspace: string): string =>
    cheminDe(CHEMINS_ESPACES.invitations, { idEspace });
  return {
    creerInvitation: (idEspace, corps) =>
      envoyer({
        methode: "POST",
        chemin: invitations(idEspace),
        corps: { valeur: corps, schema: schemaCorpsCreationInvitation },
        attendu: STATUTS.cree,
        lire: lecteur(schemaInvitationCreee),
      }),
    listerInvitations: (idEspace) =>
      envoyer({
        methode: "GET",
        chemin: invitations(idEspace),
        attendu: STATUTS.lu,
        lire: (corps) => lecteur(schemaListeInvitations)(corps)?.invitations,
      }),
    revoquerInvitation: (idEspace, idInvitation) =>
      envoyer({
        methode: "DELETE",
        chemin: cheminDe(CHEMINS_ESPACES.invitation, { idEspace, idInvitation }),
        attendu: STATUTS.vide,
        lire: vide,
      }),
    accepterInvitation: (corps) =>
      envoyer({
        methode: "POST",
        chemin: CHEMINS_ESPACES.acceptation,
        corps: { valeur: corps, schema: schemaCorpsAcceptation },
        attendu: STATUTS.lu,
        lire: lireEspace,
      }),
  };
}

async function executer<T>(
  requeter: Requeter,
  delaiMs: number,
  appel: Appel<T>,
): Promise<Resultat<T>> {
  // Un corps qui n'est pas conforme au schéma strict n'est jamais envoyé (F-014-AC34).
  if (appel.corps !== undefined && !appel.corps.schema.safeParse(appel.corps.valeur).success) {
    return { ok: false, erreur: GENERIQUE };
  }
  const controleur = new AbortController();
  const lecture = (async (): Promise<Resultat<T>> => {
    const reponse = await requeter(appel.chemin, initDe(appel, controleur.signal));
    return lireReponse(reponse, appel);
  })();
  try {
    return await avecDelai(lecture, delaiMs, controleur);
  } catch {
    return { ok: false, erreur: HORS_LIGNE };
  }
}

function initDe<T>(appel: Appel<T>, signal: AbortSignal): RequestInit {
  const entetes: Record<string, string> = { accept: "application/json" };
  if (appel.corps === undefined) {
    return { method: appel.methode, credentials: "same-origin", headers: entetes, signal };
  }
  return {
    method: appel.methode,
    credentials: "same-origin",
    headers: { ...entetes, "content-type": "application/json" },
    body: JSON.stringify(appel.corps.valeur),
    signal,
  };
}

async function lireReponse<T>(reponse: Response, appel: Appel<T>): Promise<Resultat<T>> {
  if (reponse.status === STATUT_TROP_DE_REQUETES) {
    const delaiSecondes = delaiDeRetryAfter(reponse.headers.get("Retry-After"));
    return { ok: false, erreur: { type: "trop-de-requetes", delaiSecondes } };
  }
  const corps = await lireCorps(reponse);
  if (reponse.status !== appel.attendu && reponse.status !== appel.aussi) {
    return { ok: false, erreur: classer(corps) };
  }
  const valeur = appel.lire(corps, reponse.status);
  return valeur === undefined ? { ok: false, erreur: GENERIQUE } : { ok: true, valeur };
}

/** Un corps vide vaut `null` ; un corps illisible, `undefined`, que rien n'accepte. */
async function lireCorps(reponse: Response): Promise<unknown> {
  const texte = await reponse.text();
  if (texte === "") {
    return null;
  }
  try {
    return JSON.parse(texte) as unknown;
  } catch {
    return undefined;
  }
}

function classer(corps: unknown): ErreurDEspaces {
  const enveloppe = schemaEnveloppeErreur.safeParse(corps);
  return enveloppe.success
    ? { type: "enveloppe", code: enveloppe.data.code, idRequete: enveloppe.data.idRequete }
    : GENERIQUE;
}
