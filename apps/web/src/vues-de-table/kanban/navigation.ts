// Navigation entre les arrêts du plateau (F-020-AC15) : sans DOM, depuis les piles et le nombre de
// cartes que chacune présente. Un arrêt est une carte ou l'une des commandes qui terminent une pile
// (« Nouvelle carte », « Afficher 100 cartes de plus ») ; le plateau n'est qu'un seul arrêt de
// tabulation, les flèches parcourent les autres. Haut et bas parcourent une pile, gauche et droite
// passent à la pile voisine, à la même place ou à son dernier arrêt ; Début et Fin vont aux bouts.
import type { IdLigne } from "@notionlike/document";

import { idDePile } from "./identifiants.ts";
import type { Pile } from "./piles.ts";

export type SensDeNavigation = "haut" | "bas" | "gauche" | "droite" | "debut" | "fin";

/** Un arrêt : l'identifiant d'une ligne (carte), ou celui d'une commande de pile. */
export type Arret = string;

/** Ce qui détermine les arrêts : cartes présentées par pile, et « Nouvelle carte » offerte ou non. */
export interface Parcours {
  readonly limite: (pile: Pile) => number;
  /** Faux en lecture seule : le bouton est désactivé, il ne peut pas recevoir le focus. */
  readonly creation: boolean;
}

const PREFIXE_NOUVELLE = "nouvelle:";
const PREFIXE_PLUS = "plus:";

export function arretNouvelleCarte(pile: Pile): Arret {
  return `${PREFIXE_NOUVELLE}${idDePile(pile.option)}`;
}

export function arretPlusDeCartes(pile: Pile): Arret {
  return `${PREFIXE_PLUS}${idDePile(pile.option)}`;
}

function visibles(pile: Pile, parcours: Parcours): readonly Arret[] {
  return pile.cartes.slice(0, parcours.limite(pile)).map(({ id }) => id);
}

/** Les arrêts d'une pile, dans l'ordre : ses cartes présentées, puis ses commandes. */
export function arretsDe(pile: Pile, parcours: Parcours): readonly Arret[] {
  return [
    ...visibles(pile, parcours),
    ...(parcours.creation ? [arretNouvelleCarte(pile)] : []),
    ...(pile.cartes.length > parcours.limite(pile) ? [arretPlusDeCartes(pile)] : []),
  ];
}

/** La place d'un arrêt : sa pile et son rang parmi les arrêts de la pile. */
export function placeDeLArret(
  piles: readonly Pile[],
  parcours: Parcours,
  arret: Arret,
): { readonly pile: number; readonly rang: number } | undefined {
  for (const [pile, une] of piles.entries()) {
    const rang = arretsDe(une, parcours).indexOf(arret);
    if (rang >= 0) {
      return { pile, rang };
    }
  }
  return undefined;
}

function estUneCarte(arret: Arret): boolean {
  return !arret.startsWith(PREFIXE_NOUVELLE) && !arret.startsWith(PREFIXE_PLUS);
}

// Depuis une carte : la carte de même rang de la pile voisine, ou sa dernière carte, ou sa première
// commande si elle n'a aucune carte. Depuis une commande : la commande de même sorte, sinon la première.
function arretDeLaVoisine(arrets: readonly Arret[], depart: Arret, rang: number, cartes: number) {
  if (estUneCarte(depart)) {
    return cartes === 0 ? arrets[0] : arrets[Math.min(rang, cartes - 1)];
  }
  const prefixe = depart.startsWith(PREFIXE_NOUVELLE) ? PREFIXE_NOUVELLE : PREFIXE_PLUS;
  return arrets.find((arret) => arret.startsWith(prefixe)) ?? arrets[0];
}

function dansUnePileVoisine(
  piles: readonly Pile[],
  parcours: Parcours,
  depart: Arret,
  place: { readonly pile: number; readonly rang: number },
  pas: -1 | 1,
): Arret | undefined {
  for (let rang = place.pile + pas; rang >= 0 && rang < piles.length; rang += pas) {
    const pile = piles[rang];
    const arrets = pile === undefined ? [] : arretsDe(pile, parcours);
    const vers =
      pile === undefined
        ? undefined
        : arretDeLaVoisine(arrets, depart, place.rang, visibles(pile, parcours).length);
    if (vers !== undefined) {
      return vers;
    }
  }
  return undefined;
}

// Haut, bas, début, fin : les arrêts de la pile de l'arrêt courant.
function dansLaPile(arrets: readonly Arret[], rang: number, sens: SensDeNavigation) {
  switch (sens) {
    case "haut":
      return arrets[rang - 1];
    case "bas":
      return arrets[rang + 1];
    case "debut":
      return arrets[0];
    default:
      return arrets.at(-1);
  }
}

/** L'arrêt où va le focus, ou `undefined` au bord (le focus ne bouge pas). */
export function arretVoisin(
  piles: readonly Pile[],
  parcours: Parcours,
  arret: Arret,
  sens: SensDeNavigation,
): Arret | undefined {
  const place = placeDeLArret(piles, parcours, arret);
  const pile = piles[place?.pile ?? -1];
  if (place === undefined || pile === undefined) {
    return undefined;
  }
  if (sens === "gauche" || sens === "droite") {
    return dansUnePileVoisine(piles, parcours, arret, place, sens === "gauche" ? -1 : 1);
  }
  return dansLaPile(arretsDe(pile, parcours), place.rang, sens);
}

/** Le premier arrêt de tabulation : la première carte présentée, sinon le premier arrêt du plateau. */
export function premierArret(piles: readonly Pile[], parcours: Parcours): Arret | undefined {
  for (const pile of piles) {
    const premiere = visibles(pile, parcours)[0];
    if (premiere !== undefined) {
      return premiere;
    }
  }
  return piles.flatMap((pile) => arretsDe(pile, parcours))[0];
}

/** La carte, si l'arrêt en est une (et non une commande de pile). */
export function carteDeLArret(arret: Arret): IdLigne | undefined {
  return estUneCarte(arret) ? arret : undefined;
}
