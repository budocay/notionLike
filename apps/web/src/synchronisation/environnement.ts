// Ce que le module de synchronisation reçoit de son environnement (F-013 H13) : il ne nomme aucune
// globale du navigateur, si bien qu'il s'éprouve sous Node contre le serveur réel. Seul `reseau.ts`
// assemble l'environnement du navigateur.

/** Horloge injectée : le temps, et des rappels programmés qu'on peut annuler. */
export interface Horloge {
  maintenant(): number;
  /** Rend la fonction qui annule le rappel. */
  programmer(rappel: () => void, delaiMs: number): () => void;
}

/** Un constructeur de WebSocket : celui du navigateur, ou, en test, un client qui joint le cookie. */
export type ConstructeurDeWebSocket = new (adresse: string) => WebSocket;

/**
 * Ce que l'onglet signale : le retour du réseau, ou son retour au premier plan (F-013-AC20) ; la
 * perte du réseau (F-013-AC31), qu'une WebSocket encore ouverte ne dit pas toujours aussitôt.
 */
export type Signal = "reseau" | "visible" | "hors-ligne";

/** Le canal entre onglets d'un document (H9), tel que `BroadcastChannel` le donne. */
export interface CanalEntreOnglets {
  postMessage(message: unknown): void;
  close(): void;
  onmessage: ((evenement: MessageEvent) => void) | null;
}

export interface Environnement {
  readonly WebSocket: ConstructeurDeWebSocket;
  /** Adresse du point de synchronisation, sur la seule origine qui sert l'application (AC8). */
  readonly adresse: string;
  readonly horloge: Horloge;
  /** Un tirage dans [0, 1), pour l'aléa de la reprise (F-013-AC20). */
  readonly alea: () => number;
  /** Rend le désabonnement. */
  readonly ecouter: (rappel: (signal: Signal) => void) => () => void;
  readonly ouvrirUnCanal: (nom: string) => CanalEntreOnglets;
}
