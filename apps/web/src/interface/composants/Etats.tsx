import type { ReactElement, ReactNode } from "react";

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

export function Avertissement({ children }: { readonly children: ReactNode }): ReactElement {
  return (
    <p className={ETATS.avertissement} role="alert">
      <span className={ETATS.avertissementRepere}>
        <Pictogramme nom="alerte" />
      </span>
      <span>{children}</span>
    </p>
  );
}

interface ProprietesEcranBloquant {
  readonly titre: string;
  readonly explication: string;
}

export function EcranBloquant({ titre, explication }: ProprietesEcranBloquant): ReactElement {
  return (
    <div className={ETATS.ecranBloquant} role="alert">
      <h1 className={ETATS.ecranTitre}>{titre}</h1>
      <p className={ETATS.ecranExplication}>{explication}</p>
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
