// Fragment de l'adresse : écrit par `location.hash`, relu sur `hashchange` (spec H4).
import { type EcranDEspaces, fragmentDe, fragmentDEcran, type Route } from "./route.ts";

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

/**
 * Retour après un écran de compte : un fragment calculé par `fragmentDeRetour`, d'une liste fermée
 * de formes internes. Seul le fragment change : ni l'origine ni le chemin (F-014-AC41).
 */
export function allerAuRetour(fragment: string): void {
  window.location.hash = fragment;
}

export function allerALEcran(ecran: EcranDEspaces): void {
  window.location.hash = fragmentDEcran(ecran);
}

/**
 * Remplace l'entrée courante de l'historique par l'écran donné (F-014-AC21, H4) : par
 * `location.replace` vers un fragment, sans `pushState` ni `replaceState` (F-002 H4). Le précédent
 * ne ramène pas à l'adresse remplacée. L'origine et le chemin ne changent pas.
 */
export function remplacerParLEcran(ecran: EcranDEspaces): void {
  window.location.replace(fragmentDEcran(ecran));
}
