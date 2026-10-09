import type { PageLue } from "@notionlike/document";
import type { ReactElement, ReactNode, RefObject } from "react";

import { CadreDeBarre, TeteDeBarre } from "./composants/BarreLaterale.tsx";
import { NOM_APPLICATION, NOM_BARRE_LATERALE, NOUVELLE_PAGE } from "./messages.ts";
import { rangeesVisibles } from "./pages.ts";
import { type ActionsBarre, type EcranBarre, RangeePage } from "./RangeePage.tsx";

interface Proprietes {
  readonly racines: readonly PageLue[];
  readonly ecran: EcranBarre;
  readonly actions: ActionsBarre;
  /** Message de la dernière opération refusée par le document. */
  readonly erreur: string | undefined;
  readonly boutonNouvellePage: RefObject<HTMLButtonElement | null>;
  /** Bouton de fermeture, quand la barre est ouverte en tiroir. */
  readonly fermeture?: ReactNode | undefined;
}

// Tête : le sceau et « Nouvelle page ». « Rechercher » y vient avec F-024, « Corbeille » dans le
// pied avec F-007 : aucune entrée sans effet d'ici là (F-004-AC29, AC30).
export function BarreLaterale(props: Proprietes): ReactElement {
  const { racines, ecran, actions } = props;
  const tete = (
    <TeteDeBarre
      nomEspace={NOM_APPLICATION}
      libelleNouvellePage={NOUVELLE_PAGE}
      surNouvellePage={() => actions.creerPage(null)}
      boutonNouvellePage={props.boutonNouvellePage}
      fermeture={props.fermeture}
    />
  );
  return (
    <CadreDeBarre nom={NOM_BARRE_LATERALE} tete={tete} erreur={props.erreur}>
      {racines.length === 0
        ? undefined
        : rangeesVisibles(racines, ecran.repliees).map(({ page, niveau, mere }) => (
            <RangeePage
              key={page.id}
              page={page}
              niveau={niveau}
              mere={mere}
              ecran={ecran}
              actions={actions}
            />
          ))}
    </CadreDeBarre>
  );
}
