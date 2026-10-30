// Aides des tests de la synchronisation (F-012, H11) : un client du protocole écrit pour les tests,
// qui envoie des messages bruts et lit ceux du serveur, et le client officiel de la bibliothèque
// (`@hocuspocus/provider`), branché sous Node par une WebSocket qui porte le cookie et l'origine.
import { HocuspocusProvider, HocuspocusProviderWebsocket } from "@hocuspocus/provider";
import { CHEMIN_SYNCHRO } from "@notionlike/contrats";
import * as decoding from "lib0/decoding";
import * as encoding from "lib0/encoding";
import WebSocket from "ws";
import * as syncProtocole from "y-protocols/sync";
import * as Y from "yjs";

import type { ServeurDEssai } from "./fabrique.ts";

export const TYPES = {
  synchronisation: 0,
  presence: 1,
  authentification: 2,
  demandeDePresence: 3,
  reponseDeSynchronisation: 4,
  sansEtat: 5,
  diffusionInterne: 6,
  fermeture: 7,
  accuse: 8,
} as const;

export const DELAI_SYNCHRO_MS = 60_000;

// ---------------------------------------------------------------------------------------------
// Messages bruts envoyés par un client.

function message(nom: string, type: number, ecrire?: (encodeur: encoding.Encoder) => void) {
  const encodeur = encoding.createEncoder();
  encoding.writeVarString(encodeur, nom);
  encoding.writeVarUint(encodeur, type);
  ecrire?.(encodeur);
  return encoding.toUint8Array(encodeur);
}

export const brut = {
  ouverture: (nom: string, jeton = "") =>
    message(nom, TYPES.authentification, (encodeur) => {
      encoding.writeVarUint(encodeur, 0);
      encoding.writeVarString(encodeur, jeton);
    }),
  etape1: (nom: string, doc: Y.Doc) =>
    message(nom, TYPES.synchronisation, (encodeur) => {
      syncProtocole.writeSyncStep1(encodeur, doc);
    }),
  etape2: (nom: string, miseAJour: Uint8Array) =>
    message(nom, TYPES.synchronisation, (encodeur) => {
      encoding.writeVarUint(encodeur, syncProtocole.messageYjsSyncStep2);
      encoding.writeVarUint8Array(encodeur, miseAJour);
    }),
  miseAJour: (nom: string, miseAJour: Uint8Array) =>
    message(nom, TYPES.synchronisation, (encodeur) => {
      encoding.writeVarUint(encodeur, syncProtocole.messageYjsUpdate);
      encoding.writeVarUint8Array(encodeur, miseAJour);
    }),
  // Le même message de mise à jour, porté par le type de réponse de synchronisation (4).
  reponseMiseAJour: (nom: string, miseAJour: Uint8Array) =>
    message(nom, TYPES.reponseDeSynchronisation, (encodeur) => {
      encoding.writeVarUint(encodeur, syncProtocole.messageYjsUpdate);
      encoding.writeVarUint8Array(encodeur, miseAJour);
    }),
  reponseEtape2: (nom: string, miseAJour: Uint8Array) =>
    message(nom, TYPES.reponseDeSynchronisation, (encodeur) => {
      encoding.writeVarUint(encodeur, syncProtocole.messageYjsSyncStep2);
      encoding.writeVarUint8Array(encodeur, miseAJour);
    }),
  presence: (nom: string, octets: Uint8Array) =>
    message(nom, TYPES.presence, (encodeur) => {
      encoding.writeVarUint8Array(encodeur, octets);
    }),
  sansEtat: (nom: string, texte: string) =>
    message(nom, TYPES.sansEtat, (encodeur) => {
      encoding.writeVarString(encodeur, texte);
    }),
  diffusionInterne: (nom: string, texte: string) =>
    message(nom, TYPES.diffusionInterne, (encodeur) => {
      encoding.writeVarString(encodeur, texte);
    }),
  fermeture: (nom: string) => message(nom, TYPES.fermeture),
};

// Une mise à jour qui écrit `texte` dans le type racine `contenu` d'un document neuf.
export function miseAJourTexte(texte: string, doc = new Y.Doc()): Uint8Array {
  const avant = Y.encodeStateVector(doc);
  doc.getText("contenu").insert(0, texte);
  return Y.encodeStateAsUpdate(doc, avant);
}

// ---------------------------------------------------------------------------------------------
// Messages du serveur, lus par le client brut.

export type MessageServeur =
  | { readonly nom: string; readonly type: "accordee" | "refusee"; readonly texte: string }
  | {
      readonly nom: string;
      readonly type: "synchronisation";
      readonly etape: number;
      readonly charge: Uint8Array;
    }
  | { readonly nom: string; readonly type: "accuse"; readonly applique: boolean }
  | { readonly nom: string; readonly type: "fermeture"; readonly raison: string }
  | { readonly nom: string; readonly type: "presence"; readonly charge: Uint8Array }
  | { readonly nom: string; readonly type: "autre"; readonly code: number };

export function lireMessage(octets: Uint8Array): MessageServeur {
  const decodeur = decoding.createDecoder(octets);
  const nom = decoding.readVarString(decodeur);
  const type = decoding.readVarUint(decodeur);
  switch (type) {
    case TYPES.authentification: {
      const issue = decoding.readVarUint(decodeur);
      return {
        nom,
        type: issue === 2 ? "accordee" : "refusee",
        texte: decoding.readVarString(decodeur),
      };
    }
    case TYPES.synchronisation:
    case 4:
      return {
        nom,
        type: "synchronisation",
        etape: decoding.readVarUint(decodeur),
        charge: decoding.readVarUint8Array(decodeur),
      };
    case TYPES.accuse:
      return { nom, type: "accuse", applique: decoding.readVarUint(decodeur) === 1 };
    case TYPES.fermeture:
      return { nom, type: "fermeture", raison: decoding.readVarString(decodeur) };
    case TYPES.presence:
      return { nom, type: "presence", charge: decoding.readVarUint8Array(decodeur) };
    default:
      return { nom, type: "autre", code: type };
  }
}

export interface Fermeture {
  readonly code: number;
  readonly raison: string;
}

export interface OptionsDeConnexion {
  readonly cookie?: string;
  readonly origine?: string | null;
  readonly chemin?: string;
  readonly enTetes?: Readonly<Record<string, string>>;
  readonly protocoles?: readonly string[];
}

// Un client hors navigateur : il lit le statut d'un refus de connexion.
export class ClientBrut {
  readonly recus: MessageServeur[] = [];
  readonly fermeture: Promise<Fermeture>;
  // Documents tenus par le client : chaque message de synchronisation reçu y est appliqué.
  readonly docs = new Map<string, Y.Doc>();

  readonly prise: WebSocket;

  constructor(prise: WebSocket) {
    this.prise = prise;
    this.fermeture = new Promise((resolve) => {
      prise.on("close", (code, raison) => {
        resolve({ code, raison: raison.toString("utf8") });
      });
    });
    prise.on("message", (donnees: Buffer) => {
      let lu: MessageServeur;
      try {
        lu = lireMessage(new Uint8Array(donnees));
      } catch {
        return;
      }
      this.recus.push(lu);
      this.appliquer(lu);
    });
  }

  private appliquer(lu: MessageServeur): void {
    if (lu.type !== "synchronisation") {
      return;
    }
    const doc = this.doc(lu.nom);
    if (lu.etape === syncProtocole.messageYjsSyncStep1) {
      return;
    }
    Y.applyUpdate(doc, lu.charge, "serveur");
  }

  doc(nom: string): Y.Doc {
    const existant = this.docs.get(nom);
    if (existant !== undefined) {
      return existant;
    }
    const doc = new Y.Doc();
    this.docs.set(nom, doc);
    return doc;
  }

  envoyer(octets: Uint8Array): void {
    this.prise.send(octets);
  }

  // Une ouverture et l'étape 1 du client ; rend la réponse d'authentification.
  async ouvrir(nom: string, jeton = ""): Promise<MessageServeur> {
    const depuis = this.recus.length;
    this.envoyer(brut.ouverture(nom, jeton));
    this.envoyer(brut.etape1(nom, this.doc(nom)));
    return this.attendre(
      (lu) => lu.nom === nom && (lu.type === "accordee" || lu.type === "refusee"),
      depuis,
    );
  }

  // Une ouverture qui doit être accordée et recevoir l'état du document (l'étape 2 du serveur).
  async ouvrirEtSynchroniser(nom: string): Promise<"read-write" | "readonly"> {
    const depuis = this.recus.length;
    const reponse = await this.ouvrir(nom);
    if (reponse.type !== "accordee") {
      throw new Error(`ouverture refusée : ${JSON.stringify(reponse)}`);
    }
    await this.attendre(
      (lu) => lu.nom === nom && lu.type === "synchronisation" && lu.etape === 1,
      depuis,
    );
    return reponse.texte as "read-write" | "readonly";
  }

  attendre(
    predicat: (lu: MessageServeur) => boolean,
    depuis = 0,
    delaiMs = 10_000,
  ): Promise<MessageServeur> {
    return attendreValeur(() => this.recus.slice(depuis).find(predicat), delaiMs);
  }

  depuis(index: number, nom?: string): MessageServeur[] {
    return this.recus.slice(index).filter((lu) => nom === undefined || lu.nom === nom);
  }

  fermer(): Promise<Fermeture> {
    this.prise.close();
    return this.fermeture;
  }
}

export type IssueDeConnexion =
  | { readonly issue: "etablie"; readonly client: ClientBrut }
  | { readonly issue: "refusee"; readonly statut: number };

const prisesOuvertes = new Set<WebSocket>();

export function connecter(
  serveur: ServeurDEssai,
  options: OptionsDeConnexion = {},
): Promise<IssueDeConnexion> {
  const origine = options.origine === undefined ? serveur.urlPublique : options.origine;
  const enTetes: Record<string, string> = {
    ...(options.cookie === undefined ? {} : { Cookie: options.cookie }),
    ...(origine === null ? {} : { Origin: origine }),
    ...options.enTetes,
  };
  const url = `ws://127.0.0.1:${String(serveur.port)}${options.chemin ?? CHEMIN_SYNCHRO}`;
  const prise = new WebSocket(url, [...(options.protocoles ?? [])], { headers: enTetes });
  prisesOuvertes.add(prise);
  prise.on("error", () => undefined);
  return new Promise((resolve) => {
    prise.once("unexpected-response", (_requete, reponse) => {
      resolve({ issue: "refusee", statut: reponse.statusCode ?? 0 });
      prise.terminate();
    });
    prise.once("open", () => {
      resolve({ issue: "etablie", client: new ClientBrut(prise) });
    });
    prise.once("close", () => {
      resolve({ issue: "refusee", statut: 0 });
    });
  });
}

export async function connecterBrut(
  serveur: ServeurDEssai,
  options: OptionsDeConnexion = {},
): Promise<ClientBrut> {
  const issue = await connecter(serveur, options);
  if (issue.issue !== "etablie") {
    throw new Error(`connexion refusée : ${String(issue.statut)}`);
  }
  return issue.client;
}

// ---------------------------------------------------------------------------------------------
// Client officiel.

export interface Fournisseur {
  readonly provider: HocuspocusProvider;
  readonly prise: HocuspocusProviderWebsocket;
  readonly doc: Y.Doc;
  readonly fermetures: string[];
  readonly refus: string[];
  readonly portees: string[];
}

const prisesDeFournisseurs = new Set<HocuspocusProviderWebsocket>();

export function priseDeFournisseur(
  serveur: Pick<ServeurDEssai, "urlDeSynchro" | "urlPublique">,
  cookie: string,
) {
  class PriseAvecCookie extends WebSocket {
    constructor(url: string) {
      super(url, { headers: { Cookie: cookie, Origin: serveur.urlPublique } });
    }

    // Fermée en cours de connexion, la prise émet son erreur au tick suivant, après que le
    // fournisseur a retiré ses écouteurs : sans écouteur, Node la lève (D-028). On n'absorbe que
    // cette erreur-là, et une seule fois ; toute autre erreur de prise reste visible.
    override close(code?: number, donnees?: string | Buffer): void {
      if (this.readyState === WebSocket.CONNECTING) {
        this.once("error", () => undefined);
      }
      super.close(code, donnees);
    }
  }
  const prise = new HocuspocusProviderWebsocket({
    url: serveur.urlDeSynchro,
    WebSocketPolyfill: PriseAvecCookie,
    delay: 100,
    minDelay: 100,
    maxDelay: 500,
  });
  prisesDeFournisseurs.add(prise);
  return prise;
}

export function fournisseur(
  prise: HocuspocusProviderWebsocket,
  nom: string,
  doc = new Y.Doc(),
): Fournisseur {
  const provider = new HocuspocusProvider({
    websocketProvider: prise,
    name: nom,
    document: doc,
    awareness: null,
    token: "jeton-ignore",
  });
  const suivi = { fermetures: [] as string[], refus: [] as string[], portees: [] as string[] };
  provider.on("close", ({ event }: { event: { reason: string } }) => {
    suivi.fermetures.push(event.reason);
  });
  provider.on("authenticationFailed", ({ reason }: { reason: string }) => {
    suivi.refus.push(reason);
  });
  provider.on("authenticated", ({ scope }: { scope: string }) => {
    suivi.portees.push(scope);
  });
  provider.attach();
  return { provider, prise, doc, ...suivi };
}

export async function fournisseurSynchronise(
  prise: HocuspocusProviderWebsocket,
  nom: string,
  doc = new Y.Doc(),
): Promise<Fournisseur> {
  const ouvert = fournisseur(prise, nom, doc);
  await attendreQue(() => ouvert.provider.isSynced);
  return ouvert;
}

export async function fermerLesClients(): Promise<void> {
  for (const prise of prisesDeFournisseurs) {
    prise.destroy();
  }
  prisesDeFournisseurs.clear();
  for (const prise of prisesOuvertes) {
    prise.terminate();
  }
  prisesOuvertes.clear();
}

// ---------------------------------------------------------------------------------------------
// Attentes.

export async function attendreValeur<T>(lire: () => T | undefined, delaiMs = 10_000): Promise<T> {
  const fin = Date.now() + delaiMs;
  for (;;) {
    const valeur = lire();
    if (valeur !== undefined) {
      return valeur;
    }
    if (Date.now() > fin) {
      throw new Error("attente dépassée");
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

export async function attendreQue(
  condition: () => boolean | Promise<boolean>,
  delaiMs = 10_000,
): Promise<void> {
  const fin = Date.now() + delaiMs;
  while (!(await condition())) {
    if (Date.now() > fin) {
      throw new Error("attente dépassée");
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

export function pause(dureeMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, dureeMs));
}

export function texteDe(doc: Y.Doc): string {
  return doc.getText("contenu").toString();
}

export function memesOctets(a: Uint8Array | undefined, b: Uint8Array | undefined): boolean {
  return a !== undefined && b !== undefined && Buffer.compare(Buffer.from(a), Buffer.from(b)) === 0;
}

// ---------------------------------------------------------------------------------------------
// Un espace et ses membres, par les routes réelles.

export interface MembreDEssai {
  readonly idCompte: string;
  readonly cookie: string;
}

export interface EspaceDEssai {
  readonly idEspace: string;
  readonly proprietaire: MembreDEssai;
  readonly editeur: MembreDEssai;
  readonly lecteur: MembreDEssai;
  readonly nonMembre: MembreDEssai;
}

export async function preparerUnEspace(serveur: ServeurDEssai): Promise<EspaceDEssai> {
  const proprietaire = await serveur.inscrire("proprietaire");
  const editeur = await serveur.inscrire("editeur");
  const lecteur = await serveur.inscrire("lecteur");
  const nonMembre = await serveur.inscrire("non-membre");
  const idEspace = await serveur.creerEspace(proprietaire.cookie);
  await serveur.ajouterMembre(proprietaire.cookie, idEspace, editeur.cookie, "editeur");
  await serveur.ajouterMembre(proprietaire.cookie, idEspace, lecteur.cookie, "lecteur");
  return { idEspace, proprietaire, editeur, lecteur, nonMembre };
}

export async function nombreDeDocumentsStockes(serveur: ServeurDEssai): Promise<number> {
  const lu = (await serveur.base.db.execute(`select count(*)::int as n from "document"`)) as {
    rows: { n: number }[];
  };
  return lu.rows[0]?.n ?? 0;
}
