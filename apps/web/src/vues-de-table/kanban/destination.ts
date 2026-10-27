// Calcul de la destination d'une carte (F-020-AC10, AC11, AC13) : sans DOM ni bibliothèque. Une
// destination est une pile et la carte qui précède la carte déplacée dans cette pile (`null` : en
// tête) ; la position qui en découle dans l'ordre manuel de la table place la ligne juste après cette
// carte, ou juste avant la première de la pile, sans changer l'ordre relatif des autres lignes (H1).
import type { IdLigne, IdOption } from "@notionlike/document";

import type { Pile } from "./piles.ts";

export interface Destination {
  readonly option: IdOption | null;
  /** La carte qui précède la carte déplacée dans la pile de destination ; `null` : en tête. */
  readonly precedente: IdLigne | null;
}

/**
 * La position finale de la ligne dans l'ordre manuel (celle que `deplacerLigne` attend), ou
 * `undefined` quand la ligne ne doit pas être déplacée : pile de destination sans autre carte,
 * carte précédente absente de cette pile, ou ordre qui ne changerait pas.
 */
export function positionDansLaTable(
  ordre: readonly IdLigne[],
  carte: IdLigne,
  cartesDeLaPile: readonly IdLigne[],
  precedente: IdLigne | null,
): number | undefined {
  const autres = ordre.filter((id) => id !== carte);
  const dansLaPile = cartesDeLaPile.filter((id) => id !== carte);
  const reperee = precedente ?? dansLaPile[0];
  if (reperee === undefined || (precedente !== null && !dansLaPile.includes(precedente))) {
    return undefined;
  }
  const rang = autres.indexOf(reperee);
  if (rang < 0) {
    return undefined;
  }
  const position = precedente === null ? rang : rang + 1;
  return position === ordre.indexOf(carte) ? undefined : position;
}

/** La place d'une carte parmi les piles ; `undefined` si aucune pile ne la porte. */
export function placeDeLaCarte(
  piles: readonly Pile[],
  carte: IdLigne,
): { readonly pile: number; readonly rang: number } | undefined {
  for (const [pile, { cartes }] of piles.entries()) {
    const rang = cartes.findIndex(({ id }) => id === carte);
    if (rang >= 0) {
      return { pile, rang };
    }
  }
  return undefined;
}

/** Vrai si la destination est la place que la carte occupe déjà (AC11). */
export function estLaPlaceActuelle(
  piles: readonly Pile[],
  carte: IdLigne,
  destination: Destination,
): boolean {
  const place = placeDeLaCarte(piles, carte);
  const pile = piles[place?.pile ?? -1];
  if (place === undefined || pile?.option !== destination.option) {
    return false;
  }
  return (pile.cartes[place.rang - 1]?.id ?? null) === destination.precedente;
}

export type CommandeDeCarte = "pile-precedente" | "pile-suivante" | "monter" | "descendre";

export const COMMANDES_DE_CARTE: readonly CommandeDeCarte[] = [
  "pile-precedente",
  "pile-suivante",
  "monter",
  "descendre",
];

function finDeLaPile(pile: Pile | undefined): Destination | undefined {
  return pile === undefined
    ? undefined
    : { option: pile.option, precedente: pile.cartes.at(-1)?.id ?? null };
}

// Monter ou descendre : une place dans la pile, ou rien au bord.
function dansLaPile(
  pile: Pile,
  carte: IdLigne,
  rang: number,
  sens: -1 | 1,
): Destination | undefined {
  const vers = rang + sens;
  if (vers < 0 || vers >= pile.cartes.length) {
    return undefined;
  }
  const autres = pile.cartes.filter(({ id }) => id !== carte);
  return { option: pile.option, precedente: autres[vers - 1]?.id ?? null };
}

/**
 * La destination qu'atteint une commande depuis la place de la carte, ou `undefined` si elle n'en a
 * pas (première ou dernière pile, première ou dernière carte : AC13).
 */
export function destinationDeLaCommande(
  piles: readonly Pile[],
  carte: IdLigne,
  commande: CommandeDeCarte,
): Destination | undefined {
  const place = placeDeLaCarte(piles, carte);
  const pile = piles[place?.pile ?? -1];
  if (place === undefined || pile === undefined) {
    return undefined;
  }
  switch (commande) {
    case "pile-precedente":
      return finDeLaPile(piles[place.pile - 1]);
    case "pile-suivante":
      return finDeLaPile(piles[place.pile + 1]);
    case "monter":
      return dansLaPile(pile, carte, place.rang, -1);
    case "descendre":
      return dansLaPile(pile, carte, place.rang, 1);
  }
}
