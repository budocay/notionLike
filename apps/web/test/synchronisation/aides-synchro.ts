// Aides des tests du module de synchronisation, sous Node, contre le serveur réel démarré par la
// fabrique d'essai de F-012-AC36 (F-013-AC42, H13) : ni doublure du serveur, ni du fournisseur, ni du
// protocole. Chaque appareil simulé a sa propre base IndexedDB simulée : la globale `indexedDB` rend
// celle de l'appareil dans le contexte asynchrone duquel l'appel est fait.
import "fake-indexeddb/auto";

import { AsyncLocalStorage } from "node:async_hooks";

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
} from "../../src/synchronisation/index.ts";
import type { CanalEntreOnglets, Signal } from "../../src/synchronisation/environnement.ts";
import { creerFacade } from "../aides-facade.ts";
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
  /** Exécute `action` sur cet appareil : ses appels à IndexedDB, et tout ce qui en découle. */
  sur<T>(action: () => T): T;
}

export function nouvelAppareil(): Appareil {
  const idb = new IDBFactory();
  return { idb, sur: (action) => stockage.run(idb, action) };
}

// ---------------------------------------------------------------------------------------------
// Attentes.

export async function attendreQue(
  condition: () => boolean,
  delaiMs = 8000,
  message = "condition non atteinte",
): Promise<void> {
  const debut = Date.now();
  while (!condition()) {
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
  readonly emis: Uint8Array[];
  readonly recus: Uint8Array[];
  /** Nombre de WebSocket ouvertes par ce réseau. */
  ouvertes(): number;
  couper(): void;
  retablir(): void;
  estCoupe(): boolean;
}

export function reseauDEssai(serveur: ServeurDEssai, cookie: string): Reseau {
  let coupe = false;
  let ouvertes = 0;
  const vivantes = new Set<WebSocket>();
  const emis: Uint8Array[] = [];
  const recus: Uint8Array[] = [];
  class PriseDEssai extends WebSocket {
    constructor(adresse: string) {
      // Réseau coupé : une adresse où rien n'écoute, la tentative échoue comme dans un navigateur.
      super(coupe ? "ws://127.0.0.1:9/" : adresse, {
        headers: { Cookie: cookie, Origin: serveur.urlPublique },
      } as unknown as string[]);
      ouvertes += 1;
      vivantes.add(this);
      this.addEventListener("close", () => vivantes.delete(this));
      this.addEventListener("message", (evenement) => {
        recus.push(new Uint8Array(evenement.data as ArrayBuffer));
      });
    }

    override send(donnee: Parameters<WebSocket["send"]>[0]): void {
      emis.push(new Uint8Array(donnee as ArrayBuffer).slice());
      super.send(donnee);
    }
  }
  return {
    WebSocket: PriseDEssai,
    emis,
    recus,
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
      const attente = {
        echeance: maintenant() + delaiMs,
        partir: () => {
          clearTimeout(minuterie);
          if (attentes.delete(attente)) {
            rappel();
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

export function requeteurDEssai(serveur: ServeurDEssai, cookie: string): Requeter {
  return (entree, init) => {
    const chemin = typeof entree === "string" ? entree : entree.toString();
    const entetes = new Headers(init?.headers);
    entetes.set("Cookie", cookie);
    entetes.set("Origin", serveur.urlPublique);
    return fetch(`${serveur.origine}${chemin}`, { ...init, headers: entetes });
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
  readonly surPagesSupprimees?: (idPages: readonly string[]) => void;
  /** Vrai : l'espace n'est pas l'espace local de l'appareil, sa base est ouverte par son nom. */
  readonly autreEspace?: boolean;
}

const ouverts = new Set<Onglet>();

/**
 * Ouvre l'espace comme la session d'espace le fait (base relue d'abord, H14), puis démarre sa
 * synchronisation sur le serveur réel.
 */
export async function ouvrirUnOnglet(options: OptionsDOnglet): Promise<Onglet> {
  const appareil = options.appareil ?? nouvelAppareil();
  const reseau = reseauDEssai(options.serveur, options.cookie);
  const horloge = options.horloge ?? horlogeDEssai();
  const compte = options.compte ?? compteDEssai();
  const facade = options.facade ?? creerFacade();
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
    ouvrirUnCanal: (nom) => new BroadcastChannel(nom) as unknown as CanalEntreOnglets,
  };
  const synchro = appareil.sur(() =>
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
      compte,
      serveur: serveurDesEspacesDEssai(options.serveur, options.cookie),
      surPagesSupprimees: options.surPagesSupprimees,
    }),
  );
  const onglet: Onglet = {
    idEspace: options.idEspace,
    persistance,
    facade,
    synchro,
    reseau,
    compte,
    horloge,
    signaler: (signal) => ecouteurs.forEach((rappel) => rappel(signal)),
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

export async function attendreLEtat(
  onglet: Onglet,
  attendu: EtatAffiche,
  delaiMs = 8000,
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

/** L'espace adopté par le test lui-même, et son document vide. */
export async function adopterPourLeTest(onglet: Onglet, nom = "Espace d'essai"): Promise<void> {
  await attendreQue(() => onglet.synchro.lireEtat().registreLu || true);
  const issue = await onglet.synchro.adopter(nom);
  expect(issue.sorte).toBe("adopte");
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
