import { type KeyboardEvent, type ReactElement, type Ref, useId } from "react";

import { MENU } from "./menu.classes.ts";
import { Raccourci } from "./Raccourci.tsx";

export interface EntreeDeMenu {
  readonly libelle: string;
  /** Combinaison affichée, si l'action en a une dans la déclaration des raccourcis. */
  readonly touches?: readonly string[] | undefined;
  /** La même combinaison pour `aria-keyshortcuts` : elle n'entre pas dans le nom de l'entrée. */
  readonly raccourci?: string | undefined;
  readonly surActivation: () => void;
  /** Raison d'une action momentanément impossible : l'entrée est désactivée (F-013-AC25). */
  readonly raison?: string | undefined;
}

interface Proprietes {
  /** Nom du menu : il porte le titre de la page, les entrées leur seul libellé. */
  readonly nom: string;
  readonly entrees: readonly EntreeDeMenu[];
  readonly ref?: Ref<HTMLDivElement> | undefined;
}

const PAS_DES_FLECHES: Readonly<Record<string, number>> = { ArrowDown: 1, ArrowUp: -1 };

// Flèche bas et Flèche haut parcourent les entrées disponibles, en boucle ; une entrée désactivée ne
// prend pas le focus, elle est sautée (F-006-AC11). Entrée et Espace sont ceux d'un bouton natif.
// Quand le focus est sur le menu lui-même (clic sur son bord), Flèche bas mène à la première entrée
// et Flèche haut à la dernière.
function surFleche(evenement: KeyboardEvent<HTMLDivElement>): void {
  const pas = PAS_DES_FLECHES[evenement.key];
  if (pas === undefined) {
    return;
  }
  evenement.preventDefault();
  const entrees = [
    ...evenement.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)'),
  ];
  const rang = entrees.findIndex((entree) => entree === evenement.target);
  const depart = rang === -1 && pas < 0 ? 0 : rang;
  entrees[(depart + pas + entrees.length) % entrees.length]?.focus();
}

export function MenuActions({ nom, entrees, ref }: Proprietes): ReactElement {
  const idRaisons = useId();
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
      {entrees.map(({ libelle, touches, raccourci, surActivation, raison }, rang) => (
        <button
          key={libelle}
          type="button"
          role="menuitem"
          className={MENU.entree}
          aria-keyshortcuts={raccourci}
          disabled={raison !== undefined}
          aria-describedby={raison === undefined ? undefined : `${idRaisons}-${String(rang)}`}
          onClick={surActivation}
        >
          {libelle}
          {touches !== undefined && <Raccourci touches={touches} />}
          {raison !== undefined && (
            <span id={`${idRaisons}-${String(rang)}`} hidden>
              {raison}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
