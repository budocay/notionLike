import type { KeyboardEvent, MouseEvent, ReactElement, ReactNode } from "react";

import { COQUILLE } from "./coquille.classes.ts";

/** Attributs du conteneur de la barre latérale quand elle s'ouvre en tiroir (ADR-0010). */
export interface TiroirDeCoquille {
  readonly ouvert: boolean;
  /** Nom accessible du dialogue que le conteneur devient, ouvert. */
  readonly nom: string;
  /** Identifiant du conteneur : le bouton d'ouverture le commande. */
  readonly id?: string | undefined;
  readonly surTouche?: ((evenement: KeyboardEvent<HTMLElement>) => void) | undefined;
  readonly surClic?: ((evenement: MouseEvent<HTMLElement>) => void) | undefined;
  /** Clic sur le voile, qui couvre le reste tant que le tiroir est ouvert. */
  readonly surVoile?: (() => void) | undefined;
}

interface Proprietes {
  readonly tiroir: TiroirDeCoquille;
  /** Barre latérale. */
  readonly barre: ReactNode;
  /** Le reste : avertissement, barre du haut, zone principale. */
  readonly children: ReactNode;
}

// Une seule structure aux deux largeurs (ADR-0010) : le conteneur de la barre latérale, le voile,
// puis le reste. Ouvert en tiroir, le conteneur est un dialogue modal et le reste est inerte ;
// sinon, un simple bloc. La coquille remplit ce qui la contient : la fenêtre dans l'application, un
// aperçu sur la page de démonstration.
export function Coquille({ tiroir, barre, children }: Proprietes): ReactElement {
  const { ouvert } = tiroir;
  return (
    <div className={COQUILLE.cadre}>
      <div
        id={tiroir.id}
        className={ouvert ? COQUILLE.tiroir : COQUILLE.barre}
        role={ouvert ? "dialog" : undefined}
        aria-modal={ouvert ? true : undefined}
        aria-label={ouvert ? tiroir.nom : undefined}
        onKeyDown={tiroir.surTouche}
        onClick={tiroir.surClic}
      >
        {barre}
      </div>
      {ouvert && <div className={COQUILLE.voile} data-voile="" onClick={tiroir.surVoile} />}
      <div className={COQUILLE.reste} inert={ouvert}>
        {children}
      </div>
    </div>
  );
}
