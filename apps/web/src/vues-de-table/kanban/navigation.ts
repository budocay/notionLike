// Navigation entre les cartes (F-020-AC15) : sans DOM, depuis les piles et le nombre de cartes que
// chacune présente. Les flèches haut et bas parcourent une pile, gauche et droite passent à la pile
// voisine qui a des cartes, à la même place ou à sa dernière carte ; Début et Fin vont aux bouts.
import type { IdLigne } from "@notionlike/document";

import { placeDeLaCarte } from "./destination.ts";
import type { Pile } from "./piles.ts";

export type SensDeNavigation = "haut" | "bas" | "gauche" | "droite" | "debut" | "fin";

/** Le nombre de cartes présentées par pile. */
export type Limites = (pile: Pile) => number;

function visibles(pile: Pile | undefined, limite: Limites) {
  return pile === undefined ? [] : pile.cartes.slice(0, limite(pile));
}

function dansLaPile(cartes: readonly { readonly id: IdLigne }[], rang: number, sens: string) {
  switch (sens) {
    case "haut":
      return cartes[rang - 1]?.id;
    case "bas":
      return cartes[rang + 1]?.id;
    case "debut":
      return cartes[0]?.id;
    default:
      return cartes.at(-1)?.id;
  }
}

function dansUnePileVoisine(
  piles: readonly Pile[],
  limite: Limites,
  depart: { readonly pile: number; readonly rang: number },
  pas: -1 | 1,
): IdLigne | undefined {
  for (let rang = depart.pile + pas; rang >= 0 && rang < piles.length; rang += pas) {
    const cartes = visibles(piles[rang], limite);
    const carte = cartes[Math.min(depart.rang, cartes.length - 1)];
    if (carte !== undefined) {
      return carte.id;
    }
  }
  return undefined;
}

/** La carte où va le focus, ou `undefined` au bord (le focus ne bouge pas). */
export function carteVoisine(
  piles: readonly Pile[],
  limite: Limites,
  carte: IdLigne,
  sens: SensDeNavigation,
): IdLigne | undefined {
  const place = placeDeLaCarte(piles, carte);
  if (place === undefined) {
    return undefined;
  }
  if (sens === "gauche" || sens === "droite") {
    return dansUnePileVoisine(piles, limite, place, sens === "gauche" ? -1 : 1);
  }
  return dansLaPile(visibles(piles[place.pile], limite), place.rang, sens);
}

/** La première carte présentée de la première pile qui en a : l'arrêt de tabulation par défaut. */
export function premiereCarte(piles: readonly Pile[], limite: Limites): IdLigne | undefined {
  for (const pile of piles) {
    const premiere = visibles(pile, limite)[0];
    if (premiere !== undefined) {
      return premiere.id;
    }
  }
  return undefined;
}
