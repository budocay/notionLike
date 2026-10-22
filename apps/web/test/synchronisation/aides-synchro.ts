// Aides des tests du module de synchronisation, sous Node, contre le serveur réel démarré par la
// fabrique d'essai de F-012-AC36 (F-013-AC42, H13) : ni doublure du serveur, ni du fournisseur, ni du
// protocole. Chaque appareil simulé a sa propre base IndexedDB simulée : la globale `indexedDB` rend
// celle de l'appareil dans le contexte asynchrone duquel l'appel est fait.
import "fake-indexeddb/auto";

import { AsyncLocalStorage, AsyncResource } from "node:async_hooks";

import { CHEMINS_COMPTES } from "@notionlike/contrats";
import type { DocumentEspace } from "@notionlike/document";
import {
  type CompteInscrit,
  demarrerServeurDEssai,
  type OptionsDeLaFabrique,
  type ServeurDEssai,
} from "@notionlike/server/essai";
import { IDBFactory } from "fake-indexeddb";
import { expect } from "vitest";
import * as Y from "yjs";

import { creerClientDesEspaces } from "../../src/compte/client-espaces.ts";
import type { Requeter } from "../../src/compte/moi.ts";
import { serveurDesEspaces } from "../../src/interface/branchement-synchronisation.ts";
import {
  type EntreeDuRegistre,
  inscrireAuRegistre,
  lireLeRegistre,
  ouvrirEspaceLocal,
  ouvrirPersistance,
  type Persistance,
} from "../../src/persistance/index.ts";
import {
  demarrerSynchronisation,
  type Environnement,
  idsDesPages,
  type EtatAffiche,
  type ServeurDesEspaces,
  type SourceDuCompte,
  type StatutDuCompte,
  type Synchronisation,
  typesDesPages,
} from "../../src/synchronisation/index.ts";
import type { CanalEntreOnglets, Signal } from "../../src/synchronisation/environnement.ts";
import { creerFacade, ouvrirFacade } from "../aides-facade.ts";
import { fragmentBrut } from "../aides-facade-page.ts";

// ---------------------------------------------------------------------------------------------
// Appareils simulés : une IndexedDB par appareil.

const stockage = new AsyncLocalStorage<IDBFactory>();
let parDefaut = new IDBFactory();
Object.defineProperty(globalThis, "indexedDB", {
  configurable: true,
  get: () => stockage.getStore() ?? parDefaut,
});

export function viderLAppareilParDefaut(): void {
  parDefaut = new IDBFactory();
}

export interface Appareil {
  readonly idb: IDBFactory;
  /** Préfixe des canaux entre onglets : un navigateur ne les partage qu'entre ses onglets. */
  readonly navigateur: string;
  /** Exécute `action` sur cet appareil : ses appels à IndexedDB, et tout ce qui en découle. */
  sur<T>(action: () => T): T;
}

export function nouvelAppareil(): Appareil {
  const idb = new IDBFactory();
  return { idb, navigateur: crypto.randomUUID(), sur: (action) => stockage.run(idb, action) };
}

/**
 * L'appareil a déjà ouvert cet espace comme son espace local (base de l'appareil créée), et son
 * registre porte, s'il est donné, ce rattachement : posé par le test, comme H4 le prévoit.
 */
export async function preparerLAppareil(
  appareil: Appareil,
  idEspace: string,
  entree?: EntreeDuRegistre,
): Promise<void> {
  const persistance = appareil.sur(() => ouvrirEspaceLocal(new Y.Doc(), idEspace));
  await attendreQue(() => persistance.lireEtat() === "active", 12_000, "base de l'appareil");
  persistance.fermer();
  if (entree !== undefined) {
    expect(await appareil.sur(() => inscrireAuRegistre(idEspace, entree))).toBe(true);
  }
}

// ---------------------------------------------------------------------------------------------
// Attentes.

export async function attendreQue(
  condition: () => boolean | Promise<boolean>,
  delaiMs = 8000,
  message = "condition non atteinte",
): Promise<void> {
  const debut = Date.now();
  while (!(await condition())) {
    if (Date.now() - debut > delaiMs) {
      throw new Error(message);
    }
    await new Promise((resoudre) => setTimeout(resoudre, 20));
  }
}

export function pause(ms: number): Promise<void> {
  return new Promise((resoudre) => setTimeout(resoudre, ms));
}

// ---------------------------------------------------------------------------------------------
// Réseau : WebSocket qui joint le cookie et l'origine, journal des messages, coupure.

export interface MessageEmis {
  readonly octets: Uint8Array;
}

export interface Reseau {
  readonly WebSocket: Environnement["WebSocket"];
  /** Adresses demandées par chaque WebSocket construite. */
  readonly adresses: string[];
  /** Vrai : les accusés du serveur (type 8) ne parviennent plus au fournisseur. */
  accusesPerdus: boolean;
  readonly emis: Uint8Array[];
  readonly recus: Uint8Array[];
  /** Messages émis et reçus, dans l'ordre où ils sont passés. */
  readonly journal: { readonly sens: "emis" | "recu"; readonly octets: Uint8Array }[];
  /** Nombre de WebSocket ouvertes par ce réseau. */
  ouvertes(): number;
  couper(): void;
  retablir(): void;
  estCoupe(): boolean;
}

export function reseauDEssai(
  serveur: ServeurDEssai,
  cookie: string,
  origine: string = serveur.urlPublique,
): Reseau {
  let coupe = false;
  let ouvertes = 0;
  const vivantes = new Set<WebSocket>();
  const emis: Uint8Array[] = [];
  const recus: Uint8Array[] = [];
  const journal: Reseau["journal"][number][] = [];
  const adresses: string[] = [];
  const etat = { accusesPerdus: false };
  class PriseDEssai extends WebSocket {
    constructor(adresse: string) {
      // Réseau coupé : une adresse où rien n'écoute, la tentative échoue comme dans un navigateur.
      super(coupe ? "ws://127.0.0.1:9/" : adresse, {
        headers: { Cookie: cookie, Origin: origine },
      } as unknown as string[]);
      adresses.push(adresse);
      ouvertes += 1;
      vivantes.add(this);
      this.addEventListener("close", () => vivantes.delete(this));
      this.addEventListener("message", (evenement) => {
        const octets = new Uint8Array((evenement as MessageEvent).data as ArrayBuffer);
        recus.push(octets);
        journal.push({ sens: "recu", octets });
      });
    }

    override send(donnee: Parameters<WebSocket["send"]>[0]): void {
      const octets = new Uint8Array(donnee as ArrayBuffer).slice();
      emis.push(octets);
      journal.push({ sens: "emis", octets });
      super.send(donnee);
    }

    // Chaque écouteur est appelé dans le contexte de qui l'a posé : sur son appareil simulé.
    override addEventListener(
      type: string,
      ecouteur: EventListenerOrEventListenerObject,
      options?: boolean | AddEventListenerOptions,
    ): void {
      if (typeof ecouteur !== "function") {
        super.addEventListener(type, ecouteur, options);
        return;
      }
      const lie = AsyncResource.bind(ecouteur);
      if (type !== "message") {
        super.addEventListener(type, lie, options);
        return;
      }
      super.addEventListener(
        type,
        (evenement) => {
          const octets = new Uint8Array((evenement as MessageEvent).data as ArrayBuffer);
          if (!(etat.accusesPerdus && lireMessage(octets).type === TYPES_DE_MESSAGE.accuse)) {
            lie(evenement);
          }
        },
        options,
      );
    }
  }
  return {
    WebSocket: PriseDEssai,
    adresses,
    get accusesPerdus() {
      return etat.accusesPerdus;
    },
    set accusesPerdus(perdus: boolean) {
      etat.accusesPerdus = perdus;
    },
    emis,
    recus,
    journal,
    ouvertes: () => ouvertes,
    couper: () => {
      coupe = true;
      vivantes.forEach((prise) => prise.close());
    },
    retablir: () => {
      coupe = false;
    },
    estCoupe: () => coupe,
  };
}

// ---------------------------------------------------------------------------------------------
// Horloge : le temps réel, qu'un test peut avancer.

export interface HorlogeDEssai {
  maintenant(): number;
  programmer(rappel: () => void, delaiMs: number): () => void;
  avancer(ms: number): void;
  readonly delais: number[];
}

export function horlogeDEssai(): HorlogeDEssai {
  let decalage = 0;
  const attentes = new Set<{ echeance: number; partir: () => void }>();
  const delais: number[] = [];
  const maintenant = (): number => Date.now() + decalage;
  return {
    maintenant,
    delais,
    programmer(rappel, delaiMs) {
      delais.push(delaiMs);
      // Le rappel part dans le contexte de qui l'a programmé, donc sur son appareil, même avancé.
      const lie = AsyncResource.bind(rappel);
      const attente = {
        echeance: maintenant() + delaiMs,
        partir: () => {
          clearTimeout(minuterie);
          if (attentes.delete(attente)) {
            lie();
          }
        },
      };
      const minuterie = setTimeout(attente.partir, delaiMs);
      attentes.add(attente);
      return () => {
        clearTimeout(minuterie);
        attentes.delete(attente);
      };
    },
    avancer(ms) {
      decalage += ms;
      for (const attente of [...attentes]) {
        if (attente.echeance <= maintenant()) {
          attente.partir();
        }
      }
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Compte simulé : son statut, que le test pose.

export interface CompteDEssai extends SourceDuCompte {
  poser(statut: StatutDuCompte): void;
  readonly reverifications: number[];
}

export function compteDEssai(initial: StatutDuCompte = "connecte"): CompteDEssai {
  let statut = initial;
  const abonnes = new Set<() => void>();
  const reverifications: number[] = [];
  return {
    lire: () => statut,
    abonner: (rappel) => {
      abonnes.add(rappel);
      return () => abonnes.delete(rappel);
    },
    reverifier: () => {
      reverifications.push(Date.now());
      return Promise.resolve(statut);
    },
    poser: (suivant) => {
      statut = suivant;
      abonnes.forEach((rappel) => rappel());
    },
    reverifications,
  };
}

// ---------------------------------------------------------------------------------------------
// Serveur des espaces : le client de production de F-014-AC37, sur le serveur réel.

export interface RequeteVue {
  readonly methode: string;
  readonly chemin: string;
  readonly corps: unknown;
}

/** Les requêtes émises par le client des espaces, tous tests confondus, dans l'ordre. */
export const requetesVues: RequeteVue[] = [];

/** Tant qu'elle est posée, chaque lecture d'un espace attend cette promesse avant de partir. */
export const lectures: { retenue: Promise<void> | undefined } = { retenue: undefined };

function corpsDe(init: RequestInit | undefined): unknown {
  return typeof init?.body === "string" ? (JSON.parse(init.body) as unknown) : undefined;
}

export function requeteurDEssai(serveur: ServeurDEssai, cookie: string): Requeter {
  return (entree, init) => {
    const chemin = typeof entree === "string" ? entree : entree.toString();
    requetesVues.push({ methode: init?.method ?? "GET", chemin, corps: corpsDe(init) });
    const entetes = new Headers(init?.headers);
    entetes.set("Cookie", cookie);
    entetes.set("Origin", serveur.urlPublique);
    const partir = (): Promise<Response> =>
      fetch(`${serveur.origine}${chemin}`, { ...init, headers: entetes });
    const retenue = (init?.method ?? "GET") === "GET" ? lectures.retenue : undefined;
    return retenue === undefined ? partir() : retenue.then(partir);
  };
}

export function serveurDesEspacesDEssai(serveur: ServeurDEssai, cookie: string): ServeurDesEspaces {
  return serveurDesEspaces(creerClientDesEspaces(requeteurDEssai(serveur, cookie)));
}

// ---------------------------------------------------------------------------------------------
// Un onglet synchronisé : document d'espace, synchronisation, réseau.

export interface Onglet {
  readonly idEspace: string;
  /** La persistance du document d'espace, comme la session d'espace l'ouvre. */
  readonly persistance: Persistance;
  readonly facade: DocumentEspace;
  readonly synchro: Synchronisation;
  readonly reseau: Reseau;
  readonly compte: CompteDEssai;
  readonly horloge: HorlogeDEssai;
  readonly signaler: (signal: Signal) => void;
  readonly appareil: Appareil;
}

export interface OptionsDOnglet {
  readonly serveur: ServeurDEssai;
  readonly cookie: string;
  readonly idEspace: string;
  readonly appareil?: Appareil;
  readonly facade?: DocumentEspace;
  readonly compte?: CompteDEssai;
  readonly horloge?: HorlogeDEssai;
  readonly alea?: () => number;
  readonly surDocumentsSupprimes?: (ids: readonly string[]) => void;
  readonly surEffacement?: (etape: "demande" | "faite") => void;
  /** Vrai : l'espace n'est pas l'espace local de l'appareil, sa base est ouverte par son nom. */
  readonly autreEspace?: boolean;
  /** L'origine que la WebSocket annonce ; par défaut, l'URL publique du serveur. */
  readonly origine?: string;
  /**
   * Vrai : l'appareil rejoint un espace qu'il n'a pas créé (H4) ; son document part vide, sans la
   * version que la création d'un espace inscrit.
   */
  readonly rejoint?: boolean;
}

const ouverts = new Set<Onglet>();

// Le canal entre onglets : un message reçu est traité dans le contexte de qui l'écoute.
function canalLie(canal: BroadcastChannel): CanalEntreOnglets {
  return {
    postMessage: (message) => canal.postMessage(message),
    close: () => canal.close(),
    get onmessage() {
      return canal.onmessage as CanalEntreOnglets["onmessage"];
    },
    set onmessage(ecouteur) {
      canal.onmessage = ecouteur === null ? null : AsyncResource.bind(ecouteur);
    },
  };
}

// Chaque geste du test sur la synchronisation est fait sur l'appareil de l'onglet.
function surLAppareil(appareil: Appareil, brute: Synchronisation): Synchronisation {
  return {
    lireEtat: brute.lireEtat,
    abonner: brute.abonner,
    afficherPage: (page) => appareil.sur(() => brute.afficherPage(page)),
    afficherTable: (table) => appareil.sur(() => brute.afficherTable(table)),
    afficherAucun: () => appareil.sur(() => brute.afficherAucun()),
    adopter: (nom) => appareil.sur(() => brute.adopter(nom)),
    reessayer: () => appareil.sur(() => brute.reessayer()),
    reessayerLeDocument: (idPage) => appareil.sur(() => brute.reessayerLeDocument(idPage)),
    effacerLaCopieLocale: () => appareil.sur(() => brute.effacerLaCopieLocale()),
    toutEstAcquitte: brute.toutEstAcquitte,
    estAcquitte: brute.estAcquitte,
    fermer: () => appareil.sur(() => brute.fermer()),
  };
}

/**
 * Ouvre l'espace comme la session d'espace le fait (base relue d'abord, H14), puis démarre sa
 * synchronisation sur le serveur réel.
 */
export async function ouvrirUnOnglet(options: OptionsDOnglet): Promise<Onglet> {
  const appareil = options.appareil ?? nouvelAppareil();
  const reseau = reseauDEssai(options.serveur, options.cookie, options.origine);
  const horloge = options.horloge ?? horlogeDEssai();
  const compte = options.compte ?? compteDEssai();
  const facade =
    options.facade ??
    (options.rejoint === true ? ouvrirFacade(new Y.Doc({ gc: true })) : creerFacade());
  const persistance = appareil.sur(() =>
    options.autreEspace === true
      ? ouvrirPersistance(facade.doc, { type: "espace", idEspace: options.idEspace })
      : ouvrirEspaceLocal(facade.doc, options.idEspace),
  );
  await attendreQue(() => persistance.lireEtat() !== "relecture", 12_000, "relecture de l'espace");
  const ecouteurs = new Set<(signal: Signal) => void>();
  const environnement: Environnement = {
    WebSocket: reseau.WebSocket,
    adresse: options.serveur.urlDeSynchro,
    horloge,
    alea: options.alea ?? (() => 0.5),
    ecouter: (rappel) => {
      ecouteurs.add(rappel);
      return () => ecouteurs.delete(rappel);
    },
    ouvrirUnCanal: (nom) => canalLie(new BroadcastChannel(`${appareil.navigateur}|${nom}`)),
  };
  const brute = appareil.sur(() =>
    demarrerSynchronisation({
      environnement,
      idEspace: options.idEspace,
      doc: facade.doc,
      lirePages: () => {
        try {
          return idsDesPages(facade.lire());
        } catch {
          return undefined;
        }
      },
      // F-018-AC51 : le type lu de chaque identifiant, comme l'interface le donne.
      typeDe: (id) => {
        try {
          return typesDesPages(facade.lire()).get(id);
        } catch {
          return undefined;
        }
      },
      // Ce que le test pose sur le compte parvient à la synchronisation sur son appareil.
      compte: {
        lire: compte.lire,
        abonner: (rappel) => compte.abonner(() => appareil.sur(rappel)),
        reverifier: compte.reverifier,
      },
      serveur: serveurDesEspacesDEssai(options.serveur, options.cookie),
      surDocumentsSupprimes: options.surDocumentsSupprimes,
      surEffacement: options.surEffacement,
    }),
  );
  const synchro = surLAppareil(appareil, brute);
  const onglet: Onglet = {
    idEspace: options.idEspace,
    persistance,
    facade,
    synchro,
    reseau,
    compte,
    horloge,
    signaler: (signal) => appareil.sur(() => ecouteurs.forEach((rappel) => rappel(signal))),
    appareil,
  };
  ouverts.add(onglet);
  return onglet;
}

export function fermerLesOnglets(): void {
  for (const onglet of ouverts) {
    onglet.synchro.fermer();
    onglet.persistance.fermer();
    onglet.facade.fermer();
  }
  ouverts.clear();
}

// Sous la charge de toute la suite (serveurs d'essai et PGlite en parallèle), une ouverture
// qui suit de près la fermeture du même document par la passe attend son déchargement côté
// serveur : plusieurs secondes. Le délai par défaut le couvre ; un blocage réel échoue quand même.
export async function attendreLEtat(
  onglet: Onglet,
  attendu: EtatAffiche,
  delaiMs = 20_000,
): Promise<void> {
  await attendreQue(
    () => onglet.synchro.lireEtat().affiche === attendu,
    delaiMs,
    `état « ${attendu} » non atteint (reste « ${onglet.synchro.lireEtat().affiche} »)`,
  );
}

/** Les états affichés successivement par un onglet. */
export function suivreLesEtats(onglet: Onglet): EtatAffiche[] {
  const etats: EtatAffiche[] = [onglet.synchro.lireEtat().affiche];
  onglet.synchro.abonner(() => {
    const etat = onglet.synchro.lireEtat().affiche;
    if (etats.at(-1) !== etat) {
      etats.push(etat);
    }
  });
  return etats;
}

// ---------------------------------------------------------------------------------------------
// Serveur.

export async function serveurEtCompte(
  options: OptionsDeLaFabrique = {},
): Promise<{ serveur: ServeurDEssai; compte: CompteInscrit }> {
  const serveur = await demarrerServeurDEssai(options);
  const compte = await serveur.inscrire();
  return { serveur, compte };
}

// ---------------------------------------------------------------------------------------------
// Contenu des pages.

/** Un paragraphe ajouté au contenu de la page, comme l'éditeur l'écrirait. */
export function ecrireDansLaPage(doc: Y.Doc, texte: string): void {
  const contenu = fragmentBrut(doc);
  const paragraphe = new Y.XmlElement("paragraph");
  paragraphe.insert(0, [new Y.XmlText(texte)]);
  contenu.insert(contenu.length, [paragraphe]);
}

export function texteDeLaPage(doc: Y.Doc): string {
  return fragmentBrut(doc).toString();
}

export const CHEMIN_MOI = CHEMINS_COMPTES.moi;

// ---------------------------------------------------------------------------------------------
// Messages du protocole de la bibliothèque, lus pour les constats : nom du document, type, suite.

export const TYPES_DE_MESSAGE = {
  synchronisation: 0,
  presence: 1,
  authentification: 2,
  fermeture: 7,
  accuse: 8,
} as const;

export interface MessageLu {
  readonly nom: string;
  readonly type: number;
  /** Pour une authentification émise : le jeton joint. */
  readonly jeton?: string;
}

function lireEntier(octets: Uint8Array, position: { n: number }): number {
  let valeur = 0;
  let facteur = 1;
  for (;;) {
    const octet = octets[position.n] ?? 0;
    position.n += 1;
    valeur += (octet & 0x7f) * facteur;
    if (octet < 0x80) {
      return valeur;
    }
    facteur *= 128;
  }
}

function lireChaine(octets: Uint8Array, position: { n: number }): string {
  const longueur = lireEntier(octets, position);
  const texte = new TextDecoder().decode(octets.subarray(position.n, position.n + longueur));
  position.n += longueur;
  return texte;
}

export function lireMessage(octets: Uint8Array): MessageLu {
  if (octets.length === 1) {
    return { nom: "", type: octets[0] ?? -1 };
  }
  const position = { n: 0 };
  const nom = lireChaine(octets, position);
  const type = lireEntier(octets, position);
  if (type === TYPES_DE_MESSAGE.authentification) {
    lireEntier(octets, position);
    return { nom, type, jeton: lireChaine(octets, position) };
  }
  return { nom, type };
}

export function messagesDe(liste: readonly Uint8Array[]): MessageLu[] {
  return liste.map(lireMessage);
}

// ---------------------------------------------------------------------------------------------
// Page affichée : un document lié, comme celui que l'éditeur lie.

export interface PageDEssai {
  readonly idPage: string;
  readonly doc: Y.Doc;
  readonly refus: number[];
}

export function pageDEssai(idPage: string = crypto.randomUUID()): PageDEssai {
  return { idPage, doc: new Y.Doc(), refus: [] };
}

export function afficher(onglet: Onglet, page: PageDEssai | undefined): void {
  onglet.synchro.afficherPage(
    page === undefined
      ? undefined
      : {
          idPage: page.idPage,
          doc: page.doc,
          refuserLaVersion: () => page.refus.push(Date.now()),
        },
  );
}

/** Adopte l'espace de l'onglet et attend « Synchronisé ». */
export async function adopterEtAttendre(onglet: Onglet, nom = "Espace"): Promise<void> {
  await attendreQue(() => onglet.synchro.lireEtat().registreLu);
  const issue = await onglet.synchro.adopter(nom);
  expect(issue.sorte).toBe("adopte");
  await attendreLEtat(onglet, "synchronise", 12_000);
}

// ---------------------------------------------------------------------------------------------
// Espace partagé : un propriétaire qui l'a adopté, et un membre dont l'appareil le détient (H4).

export interface EspacePartage {
  readonly idEspace: string;
  readonly proprietaire: CompteInscrit;
  readonly membre: CompteInscrit;
  readonly chez: Onglet;
  readonly ailleurs: Onglet;
}

export async function espacePartage(
  serveur: ServeurDEssai,
  role: "editeur" | "lecteur",
  pages: readonly string[] = [],
): Promise<EspacePartage> {
  const proprietaire = await serveur.inscrire("proprietaire");
  const membre = await serveur.inscrire("membre");
  const idEspace = crypto.randomUUID();
  const chez = await ouvrirUnOnglet({ serveur, cookie: proprietaire.cookie, idEspace });
  pages.forEach((titre) => chez.facade.creerPage(titre));
  await adopterEtAttendre(chez);
  await serveur.ajouterMembre(proprietaire.cookie, idEspace, membre.cookie, role);
  const appareil = nouvelAppareil();
  await preparerLAppareil(appareil, idEspace, {
    rattachement: "adopte",
    droit: role === "lecteur" ? "lecture" : "ecriture",
  });
  const ailleurs = await ouvrirUnOnglet({
    serveur,
    cookie: membre.cookie,
    idEspace,
    appareil,
    rejoint: true,
  });
  await attendreLEtat(ailleurs, "synchronise", 12_000);
  return { idEspace, proprietaire, membre, chez, ailleurs };
}

// ---------------------------------------------------------------------------------------------
// Bases de page d'un appareil, écrites et lues sans synchronisation.

/** Écrit un paragraphe dans la base d'une page de l'appareil, comme l'éditeur l'aurait fait. */
export async function ecrireDansLaBase(
  appareil: Appareil,
  idEspace: string,
  idPage: string,
  texte: string,
): Promise<void> {
  const doc = new Y.Doc();
  const persistance = appareil.sur(() =>
    ouvrirPersistance(doc, { type: "page", idEspace, idPage }),
  );
  await attendreQue(() => persistance.lireEtat() === "active", 12_000, "base de page");
  appareil.sur(() => ecrireDansLaPage(doc, texte));
  await attendreQue(() => !persistance.aDesModificationsNonEnregistrees(), 12_000);
  await pause(50);
  persistance.fermer();
  doc.destroy();
}

/** Le texte de la page tel que sa base sur l'appareil le porte, relu dans un document vierge. */
export async function lireDansLaBase(
  appareil: Appareil,
  idEspace: string,
  idPage: string,
): Promise<string> {
  const doc = new Y.Doc();
  const persistance = appareil.sur(() =>
    ouvrirPersistance(doc, { type: "page", idEspace, idPage }),
  );
  await attendreQue(() => persistance.lireEtat() === "active", 12_000, "relecture de page");
  const texte = texteDeLaPage(doc);
  persistance.fermer();
  doc.destroy();
  return texte;
}

// ---------------------------------------------------------------------------------------------
// Ce que l'appareil retient : registre, espace local, et tout le contenu de ses bases.

/** L'entrée du registre de cet espace, lue par l'interface de la persistance. */
export async function entreeDuRegistre(
  appareil: Appareil,
  idEspace: string,
): Promise<EntreeDuRegistre | undefined> {
  const lu = await appareil.sur(() => lireLeRegistre(idEspace));
  expect(lu.issue).toBe("lu");
  return lu.issue === "lu" ? lu.entree : undefined;
}

/** L'espace que l'appareil ouvre au lancement suivant : celui qu'il retenait, ou un neuf. */
export async function espaceDuLancementSuivant(appareil: Appareil): Promise<string | undefined> {
  const persistance = appareil.sur(() => ouvrirEspaceLocal(new Y.Doc(), crypto.randomUUID()));
  await attendreQue(() => persistance.lireEtat() === "active", 12_000, "base de l'appareil");
  const idEspace = persistance.idEspace();
  persistance.fermer();
  return idEspace;
}

function demander<T>(demande: IDBRequest<T>): Promise<T> {
  return new Promise((resoudre, rejeter) => {
    demande.onsuccess = () => resoudre(demande.result);
    demande.onerror = () => rejeter(demande.error ?? new Error("demande en échec"));
  });
}

/** Nom, clés et valeurs de chaque magasin de chaque base de l'appareil, octets décodés en texte. */
export async function contenuDeLAppareil(appareil: Appareil): Promise<string> {
  const decodeur = new TextDecoder();
  const enTexte = (valeur: unknown): string =>
    valeur instanceof Uint8Array
      ? decodeur.decode(valeur)
      : JSON.stringify(valeur, (_, interne: unknown) =>
          interne instanceof Uint8Array ? decodeur.decode(interne) : interne,
        );
  const textes: string[] = [];
  for (const { name = "" } of await appareil.idb.databases()) {
    const connexion = await demander(appareil.idb.open(name));
    for (const magasin of connexion.objectStoreNames) {
      const lecture = connexion.transaction(magasin).objectStore(magasin);
      const [cles, valeurs] = await Promise.all([
        demander(lecture.getAllKeys()),
        demander(lecture.getAll()),
      ]);
      textes.push(name, magasin, ...cles.map(enTexte), ...valeurs.map(enTexte));
    }
    connexion.close();
  }
  return textes.join("\n");
}
