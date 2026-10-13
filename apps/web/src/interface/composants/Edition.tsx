import type {
  CSSProperties,
  FocusEvent,
  KeyboardEvent,
  MouseEvent,
  ReactElement,
  ReactNode,
  Ref,
} from "react";

import { EDITION } from "./edition.classes.ts";

/** Corps d'une page, sous son titre : la même colonne de lecture, centrée (F-003-AC38). */
export function CorpsDePage({ children }: { readonly children: ReactNode }): ReactElement {
  return (
    <div className={EDITION.corps}>
      <div className={EDITION.colonne}>{children}</div>
    </div>
  );
}

/** Message tenu à la place de l'éditeur : il est annoncé dès qu'il paraît. */
export function NoteDePage({ texte }: { readonly texte: string }): ReactElement {
  return (
    <p className={EDITION.note} role="alert">
      {texte}
    </p>
  );
}

interface ProprietesZoneDEdition {
  readonly ref?: Ref<HTMLDivElement> | undefined;
  readonly surFocus: (evenement: FocusEvent<HTMLDivElement>) => void;
  readonly surPerteDeFocus: (evenement: FocusEvent<HTMLDivElement>) => void;
  readonly surTouche: (evenement: KeyboardEvent<HTMLDivElement>) => void;
  /** La zone de saisie, puis la barre de blocs quand elle est affichée. */
  readonly children: ReactNode;
}

/** Repère de position de la barre de blocs : ni cadre, ni surface propre (F-003-AC37). */
export function ZoneDEdition(props: ProprietesZoneDEdition): ReactElement {
  return (
    <div
      ref={props.ref}
      className={EDITION.zone}
      onFocus={props.surFocus}
      onBlur={props.surPerteDeFocus}
      onKeyDown={props.surTouche}
    >
      {props.children}
    </div>
  );
}

/** Habille le contenu saisi : titres, paragraphes, listes, invite du bloc vide. */
export function ZoneDeSaisie({ children }: { readonly children: ReactNode }): ReactElement {
  return <div className={EDITION.saisie}>{children}</div>;
}

export interface CommandeDeBloc {
  /** Nom accessible, en toutes lettres. */
  readonly nom: string;
  /** Ce que le bouton montre, en peu de signes ; décoratif. */
  readonly repere: string;
  /** Vrai si le bloc courant est de ce type. */
  readonly active: boolean;
  readonly surActivation: () => void;
}

/** Coin haut gauche de la barre, en pixels depuis celui de la zone d'édition. */
export interface PositionDeBarre {
  readonly gauche: number;
  readonly haut: number;
}

interface ProprietesBarreDeBlocs {
  readonly nom: string;
  readonly commandes: readonly CommandeDeBloc[];
  readonly position: PositionDeBarre;
  /** Échap dans la barre : le focus retourne d'où il vient. */
  readonly surAbandon: () => void;
  readonly ref?: Ref<HTMLDivElement> | undefined;
}

const PAS_DES_FLECHES_DE_BARRE: Readonly<Record<string, number>> = {
  ArrowRight: 1,
  ArrowLeft: -1,
};
const ABANDON = "Escape";

// Flèche droite et Flèche gauche parcourent les commandes, en boucle ; Entrée et Espace sont ceux
// d'un bouton natif.
function surToucheDeBarre(evenement: KeyboardEvent<HTMLDivElement>, surAbandon: () => void): void {
  if (evenement.key === ABANDON) {
    evenement.preventDefault();
    surAbandon();
    return;
  }
  const pas = PAS_DES_FLECHES_DE_BARRE[evenement.key];
  if (pas === undefined) {
    return;
  }
  evenement.preventDefault();
  const commandes = [...evenement.currentTarget.querySelectorAll<HTMLElement>("button")];
  const rang = commandes.findIndex((commande) => commande === evenement.target);
  commandes[(rang + pas + commandes.length) % commandes.length]?.focus();
}

// Le bouton enfoncé à la souris ne prend pas le focus : la sélection reste dans la zone de saisie.
function garderLeFocus(evenement: MouseEvent<HTMLElement>): void {
  evenement.preventDefault();
}

/**
 * Barre de blocs flottante (F-003-AC41) : une barre d'outils hors de l'ordre de tabulation, que le
 * raccourci de l'éditeur atteint. Elle ne porte aucune logique d'édition.
 */
export function BarreDeBlocs(props: ProprietesBarreDeBlocs): ReactElement {
  const { nom, commandes, position, surAbandon, ref } = props;
  const style = { "--barre-gauche": position.gauche, "--barre-haut": position.haut };
  return (
    <div
      ref={ref}
      className={EDITION.barre}
      style={style as CSSProperties}
      role="toolbar"
      aria-label={nom}
      onKeyDown={(evenement) => surToucheDeBarre(evenement, surAbandon)}
    >
      {commandes.map((commande) => (
        <button
          key={commande.nom}
          type="button"
          className={commande.active ? EDITION.commandeActive : EDITION.commande}
          aria-label={commande.nom}
          aria-pressed={commande.active}
          title={commande.nom}
          tabIndex={-1}
          onMouseDown={garderLeFocus}
          onClick={commande.surActivation}
        >
          <span aria-hidden="true">{commande.repere}</span>
        </button>
      ))}
    </div>
  );
}
