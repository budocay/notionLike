import type { ReactElement, Ref } from "react";

import { ETATS } from "./etats.classes.ts";
import { Pictogramme } from "./Pictogramme.tsx";

/** État de chargement : trois points qui battent ; sans mouvement, le texte dit la même chose. */
export function Chargement({ texte }: { readonly texte: string }): ReactElement {
  return (
    <p className={ETATS.chargement} role="status">
      <span className={ETATS.points} aria-hidden="true">
        <span className={ETATS.point} />
        <span className={ETATS.pointSuivant} />
        <span className={ETATS.pointDernier} />
      </span>
      {texte}
    </p>
  );
}

/** Commande offerte par un avertissement ; un bouton natif, activable à la souris comme au clavier. */
interface ActionDAvertissement {
  readonly libelle: string;
  readonly surActivation: () => void;
  readonly refBouton?: Ref<HTMLButtonElement> | undefined;
}

interface ProprietesAvertissement {
  /** Une phrase par élément, chacune sur sa ligne. */
  readonly phrases: readonly string[];
  readonly action?: ActionDAvertissement | undefined;
}

export function Avertissement({ phrases, action }: ProprietesAvertissement): ReactElement {
  return (
    <div className={ETATS.avertissement} role="alert">
      <span className={ETATS.avertissementRepere}>
        <Pictogramme nom="alerte" />
      </span>
      <div className={ETATS.avertissementTextes}>
        {phrases.map((phrase) => (
          <p key={phrase}>{phrase}</p>
        ))}
      </div>
      {action !== undefined && (
        <button
          ref={action.refBouton}
          type="button"
          className={ETATS.avertissementAction}
          onClick={action.surActivation}
        >
          {action.libelle}
        </button>
      )}
    </div>
  );
}

interface ProprietesEcranBloquant {
  readonly titre: string;
  readonly explication: string;
  /** Seconde phrase, quand l'écran a une conséquence de plus à dire. */
  readonly precision?: string | undefined;
}

export function EcranBloquant(props: ProprietesEcranBloquant): ReactElement {
  return (
    <div className={ETATS.ecranBloquant} role="alert">
      <h1 className={ETATS.ecranTitre}>{props.titre}</h1>
      <p className={ETATS.ecranExplication}>{props.explication}</p>
      {props.precision !== undefined && <p className={ETATS.ecranExplication}>{props.precision}</p>}
    </div>
  );
}

interface ProprietesEntete {
  readonly titre: string;
  /** Phrase sous le titre : invitation de l'accueil, explication de « Page introuvable ». */
  readonly explication?: string | undefined;
}

/** Tête de la zone principale : le titre sur un halo immobile, qui ne reçoit aucun pointeur. */
export function EntetePage({ titre, explication }: ProprietesEntete): ReactElement {
  return (
    <div className={ETATS.zone}>
      <div className={ETATS.halo} aria-hidden="true" />
      <div className={ETATS.contenu}>
        <h1 className={ETATS.titre}>{titre}</h1>
        {explication !== undefined && <p className={ETATS.explication}>{explication}</p>}
      </div>
    </div>
  );
}
