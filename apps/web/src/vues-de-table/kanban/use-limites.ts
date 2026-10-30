// Nombre de cartes présentées par pile (F-020-AC8, H8) : 100 d'abord, 100 de plus à chaque
// commande ; une carte déplacée ou créée dans une pile y est toujours présentée.
import { useState } from "react";

import type { IdOption } from "@notionlike/document";

import { idDePile } from "./identifiants.ts";
import type { Pile } from "./piles.ts";
import { CARTES_PAR_PAGE } from "./textes.ts";

export interface LimitesDesPiles {
  readonly limiteDe: (pile: Pile) => number;
  /** Étend la pile pour que sa carte de ce rang (à partir de 1) soit présentée. */
  readonly jusqua: (option: IdOption | null, rang: number) => void;
  readonly plus: (option: IdOption | null) => void;
}

export function useLimites(): LimitesDesPiles {
  const [limites, setLimites] = useState<ReadonlyMap<string, number>>(new Map());
  const regler = (option: IdOption | null, suivante: (actuelle: number) => number): void =>
    setLimites((avant) => {
      const cle = idDePile(option);
      const actuelle = avant.get(cle) ?? CARTES_PAR_PAGE;
      const voulue = suivante(actuelle);
      return voulue === actuelle ? avant : new Map(avant).set(cle, voulue);
    });
  return {
    limiteDe: (pile) => limites.get(idDePile(pile.option)) ?? CARTES_PAR_PAGE,
    jusqua: (option, rang) =>
      regler(option, (actuelle) =>
        rang <= actuelle ? actuelle : Math.ceil(rang / CARTES_PAR_PAGE) * CARTES_PAR_PAGE,
      ),
    plus: (option) => regler(option, (actuelle) => actuelle + CARTES_PAR_PAGE),
  };
}
