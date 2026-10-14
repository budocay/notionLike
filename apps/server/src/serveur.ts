// Écoute et arrêt (ADR-0004). Ce fichier n'importe aucun autre fichier du serveur.
import { createServer, type IncomingMessage, type RequestListener, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { Duplex } from "node:stream";

const PERIODE_DE_FERMETURE_DES_INACTIVES_MS = 20;

// Le passage en WebSocket (F-012, H1) : servi sur le même serveur HTTP et le même port que l'API, il
// traite chaque demande de passage et s'arrête avec le serveur.
export interface Passage {
  traiterPassage(requete: IncomingMessage, socket: Duplex, tete: Buffer): void;
  arreter(): Promise<void>;
}

interface OptionsDEcoute {
  readonly application: RequestListener;
  readonly passage?: Passage | undefined;
  readonly hote: string;
  readonly port: number;
  readonly delaiArretMs: number;
}

export interface Ecoute {
  readonly port: number;
  arreter(): Promise<void>;
}

// Le serveur cesse d'accepter ; une connexion est fermée dès qu'elle n'a plus de requête en cours
// (sans la fermeture répétée, elle resterait ouverte le temps du maintien de connexion de Node) ;
// ce qui reste à l'échéance est coupé.
function cesserDeServir(serveur: Server, delaiArretMs: number): Promise<void> {
  return new Promise((resolve) => {
    const inactives = setInterval(() => {
      serveur.closeIdleConnections();
    }, PERIODE_DE_FERMETURE_DES_INACTIVES_MS);
    const echeance = setTimeout(() => {
      serveur.closeAllConnections();
    }, delaiArretMs);
    // Sur un serveur déjà arrêté, `close` rend une erreur : il n'y a alors plus rien à fermer.
    serveur.close(() => {
      clearInterval(inactives);
      clearTimeout(echeance);
      resolve();
    });
  });
}

export function demarrerServeur(options: OptionsDEcoute): Promise<Ecoute> {
  const serveur = createServer(options.application);
  const { passage } = options;
  if (passage !== undefined) {
    serveur.on("upgrade", (requete: IncomingMessage, socket: Duplex, tete: Buffer) => {
      passage.traiterPassage(requete, socket, tete);
    });
  }
  // Une connexion qui n'envoie pas une requête lisible est fermée sans réponse : le serveur ne
  // répond qu'à ce que l'application a vu, donc toujours avec ses en-têtes et son enveloppe.
  serveur.on("clientError", (_erreur, connexion) => {
    connexion.destroy();
  });
  // F-008-AC25 : un échec d'écoute (port déjà pris) rejette la promesse au lieu d'être émis sans
  // écouteur. L'écoute établie, l'écouteur est retiré : il n'a plus de promesse à régler.
  return new Promise((resolve, reject) => {
    serveur.once("error", reject);
    serveur.listen(options.port, options.hote, () => {
      serveur.off("error", reject);
      resolve({
        port: (serveur.address() as AddressInfo).port,
        // Le serveur cesse d'accepter d'abord ; ses WebSocket, qu'il ne ferme pas lui-même, sont
        // fermées par le passage, dont il attend la fin.
        arreter: () =>
          Promise.all([cesserDeServir(serveur, options.delaiArretMs), passage?.arreter()]).then(
            () => undefined,
          ),
      });
    });
  });
}
