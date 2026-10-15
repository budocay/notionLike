import { type ReactElement, type ReactNode, type Ref, useId } from "react";

import { BARRE } from "./barre.classes.ts";
import { Pictogramme } from "./Pictogramme.tsx";

/** Sceau de l'espace : un motif sans texte, seul emplacement du dégradé d'accent avec le repère de
 * page courante (F-004-AC47). */
export function Sceau(): ReactElement {
  return (
    <span className={BARRE.sceau} aria-hidden="true">
      <span className={BARRE.sceauEncoche} />
    </span>
  );
}

interface ProprietesTete {
  readonly nomEspace: string;
  readonly libelleNouvellePage: string;
  readonly surNouvellePage: () => void;
  readonly boutonNouvellePage?: Ref<HTMLButtonElement> | undefined;
  /** Raison d'une création momentanément impossible : le bouton est désactivé (F-013-AC25). */
  readonly raisonNouvellePage?: string | undefined;
  /** Bouton de fermeture du tiroir, sur écran étroit seulement. */
  readonly fermeture?: ReactNode | undefined;
}

export function TeteDeBarre(props: ProprietesTete): ReactElement {
  const idRaison = useId();
  const raison = props.raisonNouvellePage;
  return (
    <>
      <div className={BARRE.enseigne}>
        <Sceau />
        <span className={BARRE.nom}>{props.nomEspace}</span>
        {props.fermeture}
      </div>
      <button
        ref={props.boutonNouvellePage}
        type="button"
        className={BARRE.nouvellePage}
        disabled={raison !== undefined}
        aria-describedby={raison === undefined ? undefined : idRaison}
        onClick={props.surNouvellePage}
      >
        <Pictogramme nom="plus" />
        <span className={BARRE.nouvellePageLibelle}>{props.libelleNouvellePage}</span>
      </button>
      {raison !== undefined && (
        <span id={idRaison} hidden>
          {raison}
        </span>
      )}
    </>
  );
}

interface ProprietesCadre {
  /** Nom accessible de la navigation. */
  readonly nom: string;
  readonly tete: ReactNode;
  /** Message de la dernière opération refusée. */
  readonly erreur?: string | undefined;
  /** Entrées qui ne sont pas des pages ; sans entrée, le pied n'est pas rendu. */
  readonly pied?: ReactNode | undefined;
  /** Rangées de l'arborescence. */
  readonly children?: ReactNode | undefined;
}

export function CadreDeBarre({ nom, tete, erreur, pied, children }: ProprietesCadre): ReactElement {
  return (
    <nav className={BARRE.cadre} aria-label={nom}>
      <div className={BARRE.tete}>{tete}</div>
      {erreur !== undefined && (
        <p role="alert" className={BARRE.message}>
          {erreur}
        </p>
      )}
      <div className={BARRE.defilement}>
        {children !== undefined && <ul className={BARRE.liste}>{children}</ul>}
      </div>
      {pied !== undefined && <div className={BARRE.pied}>{pied}</div>}
    </nav>
  );
}
