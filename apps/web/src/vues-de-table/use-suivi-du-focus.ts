// Suivi du focus de la vue calendrier (F-021-AC13, AC20, AC22) : l'élément qui a le focus est désigné
// par ce qu'il est (une case par son jour, une entrée ou une ligne sans date par l'identifiant de sa
// ligne), jamais par le nœud du DOM. Une entrée déplacée, par la main ou par une mise à jour reçue,
// est un autre nœud : le focus la rejoint où qu'elle soit. Si elle a disparu, la vue décide où il va.
import type { IdLigne } from "@notionlike/document";
import { type FocusEvent, type RefObject, useEffect, useReducer, useRef } from "react";

export type CibleDeFocus =
  | { readonly sorte: "case"; readonly jour: string }
  | { readonly sorte: "entree"; readonly ligne: IdLigne; readonly jour: string }
  | { readonly sorte: "panneau"; readonly ligne: IdLigne };

/** Ce que la vue décide quand la cible n'est pas dans le DOM : une autre cible, ou d'attendre. */
export type Repli = CibleDeFocus | "attendre" | undefined;

const ESSAIS = 4;

function parDonnee(racine: HTMLElement, attribut: string, valeur: string): HTMLElement | undefined {
  return [...racine.querySelectorAll<HTMLElement>(`[${attribut}]`)].find(
    (element) => element.getAttribute(attribut) === valeur,
  );
}

export function elementDe(racine: HTMLElement, cible: CibleDeFocus): HTMLElement | undefined {
  switch (cible.sorte) {
    case "case":
      return parDonnee(racine, "data-jour", cible.jour);
    case "entree":
      return parDonnee(racine, "data-ligne", cible.ligne);
    case "panneau":
      return parDonnee(racine, "data-sans-date", cible.ligne);
  }
}

/** La cible que désigne un élément qui reçoit le focus ; `undefined` s'il n'en désigne aucune. */
export function cibleDe(element: Element): CibleDeFocus | undefined {
  const entree = element.closest<HTMLElement>("[data-ligne]");
  const caseDuJour = element.closest<HTMLElement>("[data-jour]");
  if (entree !== null && caseDuJour !== null) {
    return {
      sorte: "entree",
      ligne: entree.getAttribute("data-ligne") ?? "",
      jour: caseDuJour.getAttribute("data-jour") ?? "",
    };
  }
  if (caseDuJour !== null) {
    return { sorte: "case", jour: caseDuJour.getAttribute("data-jour") ?? "" };
  }
  const sansDate = element.closest<HTMLElement>("[data-sans-date]");
  return sansDate === null
    ? undefined
    : { sorte: "panneau", ligne: sansDate.getAttribute("data-sans-date") ?? "" };
}

export interface SuiviDuFocus {
  /** Porte le focus sur cette cible dès qu'elle est dans le DOM, et la suit ensuite. */
  readonly suivre: (cible: CibleDeFocus) => void;
  readonly surFocus: (evenement: FocusEvent<HTMLElement>) => void;
  readonly surSortie: (evenement: FocusEvent<HTMLElement>) => void;
}

function placerLeFocus(
  racine: RefObject<HTMLElement | null>,
  suivie: { current: CibleDeFocus | undefined },
  repli: (cible: CibleDeFocus) => Repli,
): void {
  for (let essai = 0; essai < ESSAIS; essai += 1) {
    const cible = suivie.current;
    const dom = racine.current;
    if (cible === undefined || dom === null) {
      return;
    }
    const element = elementDe(dom, cible);
    if (element !== undefined) {
      if (!element.contains(document.activeElement)) {
        element.focus();
      }
      return;
    }
    const suite = repli(cible);
    if (suite === "attendre") {
      return;
    }
    suivie.current = suite;
  }
}

/**
 * `repli` est appelé avec la cible absente du DOM, à chaque rendu : il peut changer l'état de la vue
 * (déplier une case, montrer plus de lignes) et rendre `"attendre"`.
 */
export function useSuiviDuFocus(
  racine: RefObject<HTMLElement | null>,
  repli: (cible: CibleDeFocus) => Repli,
): SuiviDuFocus {
  const suivie = useRef<CibleDeFocus | undefined>(undefined);
  const [, rendre] = useReducer((n: number) => n + 1, 0);
  // Après le rendu et le retrait d'une boîte modale, qui rend le reste de la page inerte tant qu'elle
  // est montée : un effet passif suit le nettoyage des effets démontés.
  useEffect(() => placerLeFocus(racine, suivie, repli));
  return {
    suivre: (cible) => {
      suivie.current = cible;
      rendre();
    },
    surFocus: (evenement) => {
      suivie.current = cibleDe(evenement.target);
    },
    surSortie: (evenement) => {
      const { relatedTarget } = evenement;
      if (relatedTarget instanceof Node && racine.current?.contains(relatedTarget) === true) {
        return;
      }
      if (relatedTarget !== null) {
        suivie.current = undefined;
        return;
      }
      // Sans destination, le focus quitte l'élément parce qu'il est retiré du DOM (la cible suit
      // alors la ligne) ou parce que l'utilisateur sort : seul un élément resté dans le DOM sort.
      const quitte = evenement.target;
      queueMicrotask(() => {
        if (quitte.isConnected) {
          suivie.current = undefined;
        }
      });
    },
  };
}
