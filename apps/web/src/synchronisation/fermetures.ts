// Fermetures d'ouverture que l'onglet a demandées, en attente de leur écho (F-013-AC17, AC45). La
// bibliothèque du serveur traite les messages d'un document dans l'ordre, sur la connexion de ce
// document, et ne la retire qu'une fois la fermeture traitée : une demande d'ouverture du même nom
// envoyée avant irait à l'ancienne connexion et resterait sans réponse (la page refermée par la
// passe de fond puis aussitôt affichée restait « en cours »). Une nouvelle ouverture de ce nom, sur
// cette WebSocket, attend donc que le serveur ait clos la précédente : son message de fermeture
// (l'écho), un refus d'authentification, la perte de la WebSocket, ou au plus une échéance.
import type { HocuspocusProviderWebsocket } from "@hocuspocus/provider";

import type { Horloge } from "./environnement.ts";
import { clotLOuverture, octetsDe } from "./protocole.ts";

/** Au-delà, la nouvelle ouverture part quand même : le serveur ne répond plus pour ce document. */
export const ATTENTE_MAX_DE_L_ECHO_MS = 5000;

interface Attente {
  readonly suites: Set<() => void>;
  readonly annulerLEcheance: () => void;
}

const parPrise = new WeakMap<HocuspocusProviderWebsocket, Map<string, Attente>>();

function tableDe(prise: HocuspocusProviderWebsocket): Map<string, Attente> {
  const connue = parPrise.get(prise);
  if (connue !== undefined) {
    return connue;
  }
  const table = new Map<string, Attente>();
  parPrise.set(prise, table);
  // Écouteur posé après ceux du fournisseur : l'écho est d'abord remis (à personne, l'ancien
  // fournisseur est détaché), puis la nouvelle ouverture part.
  // La WebSocket du fournisseur diffuse l'événement `message` du navigateur tel quel.
  prise.on("message", (evenement: MessageEvent | undefined) => {
    const octets = octetsDe(evenement?.data);
    if (octets === undefined) {
      return;
    }
    for (const nom of [...table.keys()]) {
      if (clotLOuverture(octets, nom)) {
        liberer(table, nom);
      }
    }
  });
  prise.on("disconnect", () => {
    [...table.keys()].forEach((nom) => liberer(table, nom));
  });
  return table;
}

function liberer(table: Map<string, Attente>, nom: string): void {
  const attente = table.get(nom);
  if (attente === undefined) {
    return;
  }
  table.delete(nom);
  attente.annulerLEcheance();
  attente.suites.forEach((suite) => suite());
}

/** L'onglet va émettre la fermeture de ce document sur cette WebSocket. */
export function noterUneFermeture(
  prise: HocuspocusProviderWebsocket,
  nom: string,
  horloge: Horloge,
): void {
  const table = tableDe(prise);
  if (table.has(nom)) {
    return;
  }
  table.set(nom, {
    suites: new Set(),
    annulerLEcheance: horloge.programmer(() => liberer(table, nom), ATTENTE_MAX_DE_L_ECHO_MS),
  });
}

/**
 * Lance `suite` dès qu'aucune fermeture de ce document n'est en attente sur cette WebSocket :
 * aussitôt s'il n'y en a pas. Rend de quoi y renoncer.
 */
export function apresLaFermeture(
  prise: HocuspocusProviderWebsocket,
  nom: string,
  suite: () => void,
): () => void {
  const attente = parPrise.get(prise)?.get(nom);
  if (attente === undefined) {
    suite();
    return () => undefined;
  }
  attente.suites.add(suite);
  return () => attente.suites.delete(suite);
}
