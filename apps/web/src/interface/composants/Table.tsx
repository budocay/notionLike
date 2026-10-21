// Composants de présentation de l'écran de table (F-018) : ils ne savent rien du document de table.
// Textes, états, géométrie et actions leur sont donnés par le module des vues de table, et toute
// valeur est rendue comme du texte (AC38). Les seuls styles en ligne sont la géométrie que la
// fenêtre et les largeurs calculent : `width`, `height`, `transform` (AC55).
import type { ReactElement, ReactNode } from "react";

import { TABLE } from "./table.classes.ts";

// ── Écran ────────────────────────────────────────────────────────────────────────────────────────

export function EcranDeTableCadre(props: {
  /** Barre d'outils, sélecteur de vues compris. */
  readonly outils?: ReactNode | undefined;
  /** Annonce polie : déplacements, résultats ; lue par les technologies d'assistance seules. */
  readonly annonce: string;
  /** Message du dernier refus, annoncé sans déplacer le focus. */
  readonly alerte?: string | undefined;
  readonly idAlerte?: string | undefined;
  readonly children?: ReactNode | undefined;
}): ReactElement {
  return (
    <div className={TABLE.ecran}>
      {props.outils !== undefined && <div className={TABLE.outils}>{props.outils}</div>}
      <p role="status" className={TABLE.annonce}>
        {props.annonce}
      </p>
      <p role="alert" id={props.idAlerte} className={TABLE.alerte}>
        {props.alerte}
      </p>
      {props.children}
    </div>
  );
}

export function InvitationDeTable(props: {
  readonly texte: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <div className={TABLE.invitation}>
      <p className={TABLE.invitationTexte}>{props.texte}</p>
      {props.children}
    </div>
  );
}
