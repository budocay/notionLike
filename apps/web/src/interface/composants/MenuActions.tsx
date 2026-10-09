import type { KeyboardEvent, ReactElement, Ref } from "react";

import { MENU } from "./menu.classes.ts";
import { Raccourci } from "./Raccourci.tsx";

export interface EntreeDeMenu {
  readonly libelle: string;
  /** Combinaison affichée, si l'action en a une dans la déclaration des raccourcis. */
  readonly touches?: readonly string[] | undefined;
  /** La même combinaison pour `aria-keyshortcuts` : elle n'entre pas dans le nom de l'entrée. */
  readonly raccourci?: string | undefined;
  readonly surActivation: () => void;
}

interface Proprietes {
  /** Nom du menu : il porte le titre de la page, les entrées leur seul libellé. */
  readonly nom: string;
  readonly entrees: readonly EntreeDeMenu[];
  readonly ref?: Ref<HTMLDivElement> | undefined;
}

const PAS_DES_FLECHES: Readonly<Record<string, number>> = { ArrowDown: 1, ArrowUp: -1 };

// Flèche bas et Flèche haut parcourent les entrées, en boucle ; Entrée et Espace sont ceux d'un
// bouton natif. Quand le focus est sur le menu lui-même (clic sur son bord), Flèche bas mène à la
// première entrée et Flèche haut à la dernière.
function surFleche(evenement: KeyboardEvent<HTMLDivElement>): void {
  const pas = PAS_DES_FLECHES[evenement.key];
  if (pas === undefined) {
    return;
  }
  evenement.preventDefault();
  const entrees = [...evenement.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]')];
  const rang = entrees.findIndex((entree) => entree === evenement.target);
  const depart = rang === -1 && pas < 0 ? 0 : rang;
  entrees[(depart + pas + entrees.length) % entrees.length]?.focus();
}

export function MenuActions({ nom, entrees, ref }: Proprietes): ReactElement {
  return (
    <div
      ref={ref}
      className={MENU.cadre}
      role="menu"
      aria-label={nom}
      // Focalisable par un clic, hors de l'ordre de tabulation : le focus ne retombe pas sur `body`.
      tabIndex={-1}
      onKeyDown={surFleche}
    >
      {entrees.map(({ libelle, touches, raccourci, surActivation }) => (
        <button
          key={libelle}
          type="button"
          role="menuitem"
          className={MENU.entree}
          aria-keyshortcuts={raccourci}
          onClick={surActivation}
        >
          {libelle}
          {touches !== undefined && <Raccourci touches={touches} />}
        </button>
      ))}
    </div>
  );
}
