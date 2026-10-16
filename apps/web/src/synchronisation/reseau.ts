// Environnement du navigateur pour le module de synchronisation : seul fichier d'apps/web qui nomme
// `WebSocket` (F-013-AC38, bloc ESLint dédié), et seul du module qui lit l'adresse de la page, les
// signaux de l'onglet et l'aléa. Aucun cookie n'est lu ici : le navigateur joint de lui-même celui de
// la session à la demande de passage en WebSocket (F-013-AC8).
import { CHEMIN_SYNCHRO } from "@notionlike/contrats";

import type { Environnement, Signal } from "./environnement.ts";

const SCHEMA_CHIFFRE = "https:";
const DEUX_PUISSANCE_32 = 4_294_967_296;

/** `wss:` pour une page servie en `https:`, `ws:` sinon ; même hôte, chemin publié, sans paramètre. */
export function adresseDuPointDeSynchronisation(page: {
  readonly protocol: string;
  readonly host: string;
}): string {
  const schema = page.protocol === SCHEMA_CHIFFRE ? "wss:" : "ws:";
  return `${schema}//${page.host}${CHEMIN_SYNCHRO}`;
}

function tirer(): number {
  const [tirage = 0] = crypto.getRandomValues(new Uint32Array(1));
  return tirage / DEUX_PUISSANCE_32;
}

function ecouter(rappel: (signal: Signal) => void): () => void {
  const surReseau = (): void => rappel("reseau");
  const surPerte = (): void => rappel("hors-ligne");
  const surVisibilite = (): void => {
    if (document.visibilityState === "visible") {
      rappel("visible");
    }
  };
  window.addEventListener("online", surReseau);
  window.addEventListener("offline", surPerte);
  document.addEventListener("visibilitychange", surVisibilite);
  return () => {
    window.removeEventListener("online", surReseau);
    window.removeEventListener("offline", surPerte);
    document.removeEventListener("visibilitychange", surVisibilite);
  };
}

export function environnementDuNavigateur(): Environnement {
  return {
    WebSocket,
    adresse: adresseDuPointDeSynchronisation(window.location),
    horloge: {
      maintenant: () => Date.now(),
      programmer: (rappel, delaiMs) => {
        const minuterie = setTimeout(rappel, delaiMs);
        return () => clearTimeout(minuterie);
      },
    },
    alea: tirer,
    ecouter,
    ouvrirUnCanal: (nom) => new BroadcastChannel(nom),
  };
}
