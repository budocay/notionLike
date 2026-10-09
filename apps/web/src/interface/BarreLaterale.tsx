import type { PageLue } from "@notionlike/document";
import type { ReactElement, RefObject } from "react";

import { NOM_BARRE_LATERALE, NOUVELLE_PAGE } from "./messages.ts";
import { rangeesVisibles } from "./pages.ts";
import { type ActionsBarre, type EcranBarre, RangeePage } from "./RangeePage.tsx";

interface Proprietes {
  readonly racines: readonly PageLue[];
  readonly ecran: EcranBarre;
  readonly actions: ActionsBarre;
  /** Message de la dernière opération refusée par le document. */
  readonly erreur: string | undefined;
  readonly boutonNouvellePage: RefObject<HTMLButtonElement | null>;
}

export function BarreLaterale({
  racines,
  ecran,
  actions,
  erreur,
  boutonNouvellePage,
}: Proprietes): ReactElement {
  return (
    <nav className="barre-laterale" aria-label={NOM_BARRE_LATERALE}>
      <button
        ref={boutonNouvellePage}
        type="button"
        className="nouvelle-page"
        onClick={() => actions.creerPage(null)}
      >
        {NOUVELLE_PAGE}
      </button>
      {erreur !== undefined && (
        <p role="alert" className="erreur">
          {erreur}
        </p>
      )}
      {racines.length > 0 && (
        <ul className="pages">
          {rangeesVisibles(racines, ecran.repliees).map(({ page, niveau }) => (
            <RangeePage key={page.id} page={page} niveau={niveau} ecran={ecran} actions={actions} />
          ))}
        </ul>
      )}
    </nav>
  );
}
