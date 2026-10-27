// Le focus d'une barre « Filtres » ou « Tris » après une action qui démonte ou déplace le bouton
// activé (F-019-AC27) : il va au premier bouton actif de la liste de candidats, sinon rien ne le
// porte plus et il retomberait sur `body`. Les boutons s'enregistrent sous une clé ; la demande est
// honorée au rendu qui suit le changement de la définition.
import { useLayoutEffect, useRef } from "react";

import type { Definition } from "./definition.ts";

export const AJOUTER = "ajouter";

type ActionDeLigne = "retirer" | "monter" | "descendre";

export function cleDuBouton(action: ActionDeLigne, rang: number): string {
  return `${action}:${String(rang)}`;
}

export interface FocusDeLaListe {
  /** Le rappel de `ref` d'un bouton, enregistré sous `cle`. */
  readonly bouton: (cle: string) => (element: HTMLButtonElement | null) => void;
  /** Demande le focus pour le prochain changement de la définition : le premier candidat actif. */
  readonly apres: (candidats: readonly string[]) => void;
}

/**
 * La demande est honorée au rendu qui suit un changement de la définition, ou de l'affichage figé
 * (« Réappliquer » démonte son bouton sans toucher à la définition).
 */
export function useFocusDeLaListe(definition: Definition, fige = false): FocusDeLaListe {
  const boutons = useRef(new Map<string, HTMLButtonElement>()).current;
  const demande = useRef<readonly string[] | undefined>(undefined);
  useLayoutEffect(() => {
    const candidats = demande.current;
    demande.current = undefined;
    const cible = candidats
      ?.map((cle) => boutons.get(cle))
      .find((bouton) => bouton !== undefined && !bouton.disabled);
    cible?.focus();
  }, [definition, fige, boutons]);
  return {
    bouton: (cle) => (element) => {
      if (element === null) {
        boutons.delete(cle);
      } else {
        boutons.set(cle, element);
      }
    },
    apres: (candidats) => {
      demande.current = candidats;
    },
  };
}
