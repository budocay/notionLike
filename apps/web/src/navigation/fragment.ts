// Fragment de l'adresse : écrit par `location.hash`, relu sur `hashchange` (spec H4).
import { fragmentDe, type Route } from "./route.ts";

const CHANGEMENT_DE_FRAGMENT = "hashchange";

export function lireFragment(): string {
  return window.location.hash;
}

export function abonnerAuFragment(rappel: () => void): () => void {
  window.addEventListener(CHANGEMENT_DE_FRAGMENT, rappel);
  return () => window.removeEventListener(CHANGEMENT_DE_FRAGMENT, rappel);
}

export function allerA(route: Route): void {
  window.location.hash = fragmentDe(route);
}
