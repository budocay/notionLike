// Point de synchronisation des documents (F-012, H1, H9, H10) : le seul module du serveur qui
// construit la bibliothèque de synchronisation et le serveur WebSocket. Le code du serveur traite
// lui-même la demande de passage en WebSocket (chemin, origine, session, plafonds), crée la
// WebSocket sans serveur propre, la remet à la bibliothèque avec l'identité de la connexion, et
// relaie chacun de ses messages. Une seule instance du serveur : connexions, compteurs et signaux
// vivent dans le processus.
import "./stockage-local-neutre.ts";

import { STATUS_CODES, type IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";

import { Hocuspocus, type Connection } from "@hocuspocus/server";
import { CHEMIN_SYNCHRO, CODE_DE_FERMETURE_A_L_ARRET } from "@notionlike/contrats";
import type { Base } from "@notionlike/db";
import { WebSocketServer, type RawData, type WebSocket } from "ws";

import type { Adhesions } from "./adhesions.ts";
import { adresseDe, type RequeteLue } from "./adresse.ts";
import type { Authentification } from "./authentification.ts";
import { enTetesPourBetterAuth } from "./comptes.ts";
import type { Configuration } from "./configuration.ts";
import type { Journal, TypeDEvenementDeSynchro } from "./journal.ts";
import { origineDuPassageAdmise } from "./origine.ts";
import type { SuppressionDeSessions } from "./sessions.ts";
import { creerAcces, type Contexte } from "./synchro-acces.ts";
import {
  MINUTERIE_DU_SYSTEME,
  REGLAGES_SYNCHRO,
  type Defaillance,
  type Minuterie,
  type ReglagesSynchro,
} from "./synchro-reglages.ts";
import { creerRelais, type Connexion } from "./synchro-relais.ts";
import { creerStockage } from "./synchro-stockage.ts";

const POLITIQUE = 1008;
const PERIODE_D_ATTENTE_MS = 10;
// Deux attentes de l'arrêt, sous le délai de 10 secondes de F-008-AC7.
const ATTENTE_A_L_ARRET_MS = 3000;
const STATUTS = {
  introuvable: 404,
  origineRefusee: 403,
  nonAuthentifie: 401,
  tropDeConnexionsDuCompte: 429,
  serveurPlein: 503,
  erreurInterne: 500,
} as const;
// L'erreur que `ws` émet pour un message plus grand que `maxPayload` (F-012-AC22, AC33).
const MESSAGE_TROP_GRAND = "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH";

export interface DependancesDeSynchro {
  readonly configuration: Pick<
    Configuration,
    "urlPublique" | "originesAutorisees" | "proxysDeConfiance"
  >;
  readonly base: Base;
  readonly journal: Journal;
  readonly authentification: Authentification;
  readonly adhesions: Adhesions;
  readonly suppression: SuppressionDeSessions;
  // Paramètres de la fabrique d'essai seulement (F-012-AC36, H16).
  readonly reglages?: ReglagesSynchro | undefined;
  readonly minuterie?: Minuterie | undefined;
  readonly defaillance?: Defaillance | undefined;
}

export interface Synchronisation {
  readonly reglages: ReglagesSynchro;
  traiterPassage(requete: IncomingMessage, socket: Duplex, tete: Buffer): void;
  arreter(): Promise<void>;
}

interface Identite {
  readonly idCompte: string;
  readonly idSession: string;
  readonly adresse: string;
  readonly enTetes: Headers;
}

type Examen =
  | { readonly issue: "refus"; readonly statut: number; readonly motif?: string }
  | { readonly issue: "acceptee"; readonly identite: Identite };

function lue(requete: IncomingMessage): RequeteLue {
  return {
    socket: requete.socket,
    get: (nom) => {
      const valeur = requete.headers[nom.toLowerCase()];
      return Array.isArray(valeur) ? valeur.join(", ") : valeur;
    },
  };
}

function octetsDe(donnees: RawData): Uint8Array {
  if (Array.isArray(donnees)) {
    return Buffer.concat(donnees);
  }
  return donnees instanceof ArrayBuffer ? new Uint8Array(donnees) : donnees;
}

function attendreQue(condition: () => boolean, delaiMs: number): Promise<void> {
  const fin = Date.now() + delaiMs;
  return new Promise((resolve) => {
    const verifier = (): void => {
      if (condition() || Date.now() >= fin) {
        resolve();
        return;
      }
      setTimeout(verifier, PERIODE_D_ATTENTE_MS);
    };
    verifier();
  });
}

// Le refus de connexion : un statut HTTP écrit sur la socket, puis la socket détruite (H8 a).
function refuserLePassage(socket: Duplex, statut: number): void {
  if (socket.destroyed) {
    return;
  }
  socket.once("finish", () => {
    socket.destroy();
  });
  socket.end(
    `HTTP/1.1 ${String(statut)} ${STATUS_CODES[statut] ?? ""}\r\n` +
      "Connection: close\r\nContent-Length: 0\r\n\r\n",
  );
}

export function creerSynchronisation(dependances: DependancesDeSynchro): Synchronisation {
  const { configuration, base, journal, authentification } = dependances;
  const reglages = dependances.reglages ?? REGLAGES_SYNCHRO;
  const minuterie = dependances.minuterie ?? MINUTERIE_DU_SYSTEME;
  const connexions = new Set<Connexion>();
  const clients = new Map<Connexion, ReturnType<Hocuspocus["handleConnection"]>>();
  let reservees = 0;
  let arret = false;
  let annulerLeFilet: (() => void) | undefined;

  // F-012-AC22 : la limite de taille d'un message est celle de `ws`, réglée ici.
  const serveurWs = new WebSocketServer({
    noServer: true,
    maxPayload: reglages.octetsParMessage,
    perMessageDeflate: false,
  });
  serveurWs.on("error", (erreur) => {
    journal.evenementDeSynchro({ type: "connexion-fermee", erreur });
  });

  function* ouvertures(): Generator<Connection<Contexte>> {
    for (const document of hocuspocus.documents.values()) {
      yield* document.getConnections() as Connection<Contexte>[];
    }
  }

  const acces = creerAcces({
    base,
    journal,
    documentsParConnexion: reglages.documentsParConnexion,
    ouvertures,
  });

  const stockage = creerStockage({
    base,
    journal,
    reglages,
    minuterie,
    defaillance: dependances.defaillance,
    fermerLesOuvertures: (nom, motif) => {
      for (const ouverture of hocuspocus.documents.get(nom)?.getConnections() ?? []) {
        ouverture.close({ code: 1000, reason: motif });
      }
    },
  });

  // Chaque crochet rend une promesse ; seuls ceux-ci sont posés. Le ramasse-miettes de Yjs reste
  // actif sur tout document tenu par le serveur, document d'espace compris (ADR-0001, F-007).
  const hocuspocus = new Hocuspocus<Contexte>({
    name: null,
    quiet: true,
    debounce: reglages.attenteDEnregistrementMs,
    maxDebounce: reglages.attenteMaxDEnregistrementMs,
    unloadImmediately: true,
    yDocOptions: { gc: true, gcFilter: () => true },
    onAuthenticate: ({ documentName, context, connectionConfig }) =>
      acces.decider(documentName, context, (lectureSeule) => {
        connectionConfig.readOnly = lectureSeule;
      }),
    connected: async ({ connection }) => {
      acces.verifierLEtablissement(connection);
    },
    onLoadDocument: ({ document, documentName }) => stockage.charger(document, documentName),
    onStoreDocument: ({ document }) => stockage.enregistrer(document),
    onChange: async ({ document, update }) => {
      stockage.noterLeChangement(document, update);
    },
    // Une ouverture en lecture seule n'est pas contrôlée : la bibliothèque n'applique rien et
    // répond par l'accusé négatif (F-012-AC10).
    beforeSync: async ({ connection, document, type, payload }) => {
      if (!connection.readOnly) {
        await stockage.controlerLaMiseAJour(document, type, payload);
      }
    },
  });

  function fermerLaConnexion(
    connexion: Connexion,
    code: number,
    motif: string,
    type: TypeDEvenementDeSynchro = "acces-retire",
  ): void {
    if (connexion.fermee) {
      return;
    }
    connexion.fermee = true;
    journal.evenementDeSynchro({
      type,
      adresse: connexion.adresse,
      idCompte: connexion.idCompte,
      motif: motif === "" ? undefined : motif,
      code,
    });
    connexion.prise.close(code, motif);
    // La bibliothèque ne voit plus rien de cette connexion : ses ouvertures sont fermées tout de
    // suite, sans message, la WebSocket étant déjà en fermeture.
    clients.get(connexion)?.handleClose({ code, reason: motif });
  }

  function etablir(prise: WebSocket, identite: Identite): void {
    const connexion: Connexion = {
      ...identite,
      prise,
      ouvertures: new Map(),
      accordeesEnVol: 0,
      fenetre: { debut: minuterie.maintenant(), nombre: 0 },
      fermee: false,
    };
    connexions.add(connexion);
    // F-012-AC33 : posé avant tout message ; sans lui, l'erreur d'un message trop grand arrête le
    // processus. `ws` ferme lui-même la connexion par le code 1009.
    prise.on("error", (erreur: Error & { code?: string }) => {
      const tropGrand = erreur.code === MESSAGE_TROP_GRAND;
      journal.evenementDeSynchro({
        type: tropGrand ? "limite-atteinte" : "connexion-fermee",
        adresse: connexion.adresse,
        idCompte: connexion.idCompte,
        motif: tropGrand ? "message-trop-grand" : undefined,
        erreur: tropGrand ? undefined : erreur,
      });
    });
    const relais = creerRelais(connexion, reglages, minuterie.maintenant, () => {
      fermerLaConnexion(connexion, POLITIQUE, "trop-de-requetes", "limite-atteinte");
    });
    const client = hocuspocus.handleConnection(
      {
        get readyState() {
          return prise.readyState;
        },
        send(donnees: Uint8Array) {
          relais.observerLEnvoi(donnees);
          prise.send(donnees);
        },
        close(code?: number, raison?: string) {
          prise.close(code, raison);
        },
      },
      new Request(new URL(CHEMIN_SYNCHRO, configuration.urlPublique)),
      { connexion },
    );
    clients.set(connexion, client);
    prise.on("message", (donnees) => {
      relais.recevoir(octetsDe(donnees), client.handleMessage);
    });
    prise.on("close", (code) => {
      connexions.delete(connexion);
      clients.delete(connexion);
      connexion.fermee = true;
      client.handleClose({ code, reason: "" });
      journal.evenementDeSynchro({
        type: "connexion-fermee",
        adresse: connexion.adresse,
        idCompte: connexion.idCompte,
        code,
      });
    });
    journal.evenementDeSynchro({
      type: "connexion-etablie",
      adresse: connexion.adresse,
      idCompte: connexion.idCompte,
    });
  }

  function compteDesConnexions(idCompte: string): number {
    return [...connexions].filter((connexion) => connexion.idCompte === idCompte).length;
  }

  // F-012-AC1 à AC4, AC15, AC24 : chemin, arrêt, origine, plafond du serveur, session (par le code
  // des routes protégées de F-009), plafond du compte. Aucun autre moyen n'authentifie : ni l'URL,
  // ni `Authorization`, ni un sous-protocole, ni un message du protocole.
  async function examiner(requete: IncomingMessage, adresse: string): Promise<Examen> {
    const enTetes = lue(requete);
    if ((requete.url ?? "").split("?")[0] !== CHEMIN_SYNCHRO) {
      return { issue: "refus", statut: STATUTS.introuvable };
    }
    if (arret) {
      return { issue: "refus", statut: STATUTS.serveurPlein };
    }
    if (!origineDuPassageAdmise(configuration, enTetes)) {
      return { issue: "refus", statut: STATUTS.origineRefusee, motif: "origine-refusee" };
    }
    if (connexions.size + reservees >= reglages.connexionsParServeur) {
      return { issue: "refus", statut: STATUTS.serveurPlein, motif: "quota-atteint" };
    }
    let session: Awaited<ReturnType<Authentification["lireLaSession"]>>;
    try {
      session = await authentification.lireLaSession(enTetesPourBetterAuth(enTetes, adresse));
    } catch {
      return { issue: "refus", statut: STATUTS.erreurInterne, motif: "erreur-interne" };
    }
    if (session === undefined) {
      return { issue: "refus", statut: STATUTS.nonAuthentifie, motif: "non-authentifie" };
    }
    const identite = {
      idCompte: session.compte.id,
      idSession: session.idSession,
      adresse,
      enTetes: enTetesPourBetterAuth(enTetes, adresse),
    };
    return { issue: "acceptee", identite };
  }

  // Les plafonds sont relus juste avant l'établissement, sans attente entre la lecture et la
  // réservation de la place.
  function plafondAtteint(identite: Identite): number | undefined {
    if (arret || connexions.size + reservees >= reglages.connexionsParServeur) {
      return STATUTS.serveurPlein;
    }
    return compteDesConnexions(identite.idCompte) >= reglages.connexionsParCompte
      ? STATUTS.tropDeConnexionsDuCompte
      : undefined;
  }

  async function passer(requete: IncomingMessage, socket: Duplex, tete: Buffer): Promise<void> {
    const adresse = adresseDe(lue(requete), configuration.proxysDeConfiance);
    const examen = await examiner(requete, adresse);
    const statut = examen.issue === "refus" ? examen.statut : plafondAtteint(examen.identite);
    if (examen.issue === "refus" || statut !== undefined) {
      journal.evenementDeSynchro({
        type: "connexion-refusee",
        adresse,
        idCompte: examen.issue === "acceptee" ? examen.identite.idCompte : undefined,
        motif: examen.issue === "refus" ? examen.motif : "quota-atteint",
        code: statut,
      });
      refuserLePassage(socket, statut ?? STATUTS.erreurInterne);
      return;
    }
    if (socket.destroyed) {
      return;
    }
    reservees += 1;
    serveurWs.handleUpgrade(requete, socket, tete, (prise) => {
      reservees -= 1;
      etablir(prise, examen.identite);
    });
  }

  async function reverifierLaConnexion(connexion: Connexion): Promise<void> {
    let session: Awaited<ReturnType<Authentification["lireLaSession"]>>;
    try {
      session = await authentification.lireLaSession(connexion.enTetes);
    } catch {
      fermerLaConnexion(connexion, POLITIQUE, "erreur-interne");
      return;
    }
    if (session?.idSession !== connexion.idSession) {
      fermerLaConnexion(connexion, POLITIQUE, "non-authentifie");
      return;
    }
    await acces.reverifier(connexion);
  }

  // F-012-AC14 : le filet de 60 secondes, sur l'horloge injectée.
  function programmerLeFilet(): void {
    annulerLeFilet = minuterie.programmer(() => {
      const vivantes = [...connexions].filter((connexion) => !connexion.fermee);
      void Promise.all(vivantes.map(reverifierLaConnexion)).finally(() => {
        if (!arret) {
          programmerLeFilet();
        }
      });
    }, reglages.periodeDeReverificationMs);
  }
  programmerLeFilet();

  // F-012-AC12, AC13 : le signal du module des adhésions (F-011-AC32).
  dependances.adhesions.abonner((changement) => {
    acces.surChangementDAdhesion(changement);
  });
  // F-012-AC14, H18 : toute suppression de session ferme ses connexions, et seulement les siennes.
  dependances.suppression.abonner((session) => {
    for (const connexion of connexions) {
      if (connexion.idSession === session.idSession) {
        fermerLaConnexion(connexion, POLITIQUE, "non-authentifie");
      }
    }
  });

  function enregistrementsFinis(): boolean {
    return [...hocuspocus.documents.values()].every((document) => {
      const id = `onStoreDocument-${document.name}`;
      return (
        !hocuspocus.debouncer.isDebounced(id) &&
        !hocuspocus.debouncer.isCurrentlyExecuting(id) &&
        !document.saveMutex.isLocked()
      );
    });
  }

  return {
    reglages,
    traiterPassage(requete, socket, tete) {
      // Un client parti pendant l'examen de sa demande n'arrête pas le processus.
      socket.on("error", () => undefined);
      void passer(requete, socket, tete);
    },
    // F-012-AC31 : plus de connexion acceptée, les instantanés en attente enregistrés (un essai
    // pour ceux dont une relance est en cours), puis chaque WebSocket fermée par le code 1001, ce
    // qui ferme ses ouvertures sans message et décharge les documents.
    async arreter() {
      arret = true;
      annulerLeFilet?.();
      hocuspocus.flushPendingStores();
      await stockage.essayerLesRelances();
      await attendreQue(enregistrementsFinis, ATTENTE_A_L_ARRET_MS);
      for (const connexion of [...connexions]) {
        fermerLaConnexion(connexion, CODE_DE_FERMETURE_A_L_ARRET, "", "connexion-fermee");
      }
      await attendreQue(
        () => hocuspocus.getDocumentsCount() === 0 && connexions.size === 0,
        ATTENTE_A_L_ARRET_MS,
      );
      for (const connexion of connexions) {
        connexion.prise.terminate();
      }
      serveurWs.close();
    },
  };
}
