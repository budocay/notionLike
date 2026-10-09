import type { ReactElement } from "react";

import { MENU } from "./menu.classes.ts";
import { Raccourci } from "./Raccourci.tsx";

export interface EntreeDeMenu {
  readonly libelle: string;
  /** Combinaison affichée, si l'action en a une dans la déclaration des raccourcis. */
  readonly touches?: readonly string[] | undefined;
  readonly surActivation: () => void;
}

interface Proprietes {
  /** Nom du menu : il porte le titre de la page, les entrées leur seul libellé. */
  readonly nom: string;
  readonly entrees: readonly EntreeDeMenu[];
}

export function MenuActions({ nom, entrees }: Proprietes): ReactElement {
  return (
    <div className={MENU.cadre} role="menu" aria-label={nom}>
      {entrees.map(({ libelle, touches, surActivation }) => (
        <button
          key={libelle}
          type="button"
          role="menuitem"
          className={MENU.entree}
          onClick={surActivation}
        >
          {libelle}
          {touches !== undefined && <Raccourci touches={touches} />}
        </button>
      ))}
    </div>
  );
}
