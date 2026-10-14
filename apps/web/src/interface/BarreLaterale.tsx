import type { PageLue } from "@notionlike/document";
import type { ReactElement, ReactNode, RefObject } from "react";

import { allerALaCorbeille } from "../navigation/fragment.ts";
import { CadreDeBarre, TeteDeBarre } from "./composants/CadreDeBarre.tsx";
import { ActionDeCompte } from "./composants/Compte.tsx";
import { NOM_APPLICATION, NOM_BARRE_LATERALE, NOUVELLE_PAGE } from "./messages.ts";
import { ENTREE_CORBEILLE } from "./messages-corbeille.ts";
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
  /** Zone de compte (F-010), dans la tête, après « Nouvelle page ». */
  readonly compte?: ReactNode | undefined;
  /** Vrai quand l'écran de la corbeille est affiché : son entrée est marquée courante (F-007-AC1). */
  readonly corbeilleCourante?: boolean | undefined;
}

// Tête : le sceau et « Nouvelle page ». « Rechercher » y vient avec F-024 : aucune entrée sans effet
// d'ici là (F-004-AC29). Pied : l'entrée « Corbeille », et nulle part ailleurs (F-004-AC30, F-007-AC1).
export function BarreLaterale(props: Proprietes): ReactElement {
  const { racines, ecran, actions } = props;
  const tete = (
    <>
      <TeteDeBarre
        nomEspace={NOM_APPLICATION}
        libelleNouvellePage={NOUVELLE_PAGE}
        surNouvellePage={() => actions.creerPage(null)}
        boutonNouvellePage={props.boutonNouvellePage}
        fermeture={props.fermeture}
      />
      {props.compte}
    </>
  );
  return (
    <CadreDeBarre
      nom={NOM_BARRE_LATERALE}
      tete={tete}
      erreur={props.erreur}
      pied={
        <ActionDeCompte
          libelle={ENTREE_CORBEILLE}
          surActivation={allerALaCorbeille}
          courante={props.corbeilleCourante === true}
        />
      }
    >
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
