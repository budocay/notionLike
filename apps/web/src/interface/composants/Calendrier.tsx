// Composants de présentation de la vue calendrier (F-021) : ils ne savent rien du document de table.
// Textes, noms accessibles, états et actions leur sont donnés par le module des vues de table, et
// toute valeur (libellé d'entrée, nom de colonne) est rendue comme du texte (F-021-AC27).
import type { FocusEvent, KeyboardEvent, ReactElement, ReactNode, Ref } from "react";

import { CALENDRIER } from "./calendrier.classes.ts";

/** Cadre de la vue : il porte les menus posés sur une case et suit le focus de ses éléments. */
export function CadreDuCalendrier(props: {
  readonly refCadre: Ref<HTMLDivElement>;
  readonly surFocus: (evenement: FocusEvent<HTMLElement>) => void;
  readonly surSortie: (evenement: FocusEvent<HTMLElement>) => void;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <div
      ref={props.refCadre}
      className={CALENDRIER.cadre}
      onFocus={props.surFocus}
      onBlur={props.surSortie}
    >
      {props.children}
    </div>
  );
}

export function TitreDuMois({ texte }: { readonly texte: string }): ReactElement {
  return <h2 className={CALENDRIER.titre}>{texte}</h2>;
}

/** Grille du mois (AC21) : des rangées de semaine, des en-têtes de colonne, des cases. */
export function GrilleDuCalendrier(props: {
  readonly nom: string;
  readonly jours: readonly string[];
  readonly refGrille: Ref<HTMLDivElement>;
  readonly surTouche: (evenement: KeyboardEvent<HTMLDivElement>) => void;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <div
      ref={props.refGrille}
      role="grid"
      aria-label={props.nom}
      className={CALENDRIER.grille}
      onKeyDown={props.surTouche}
    >
      <div role="row" className={CALENDRIER.enTetes}>
        {props.jours.map((jour) => (
          <div key={jour} role="columnheader" className={CALENDRIER.enTete}>
            {jour}
          </div>
        ))}
      </div>
      {props.children}
    </div>
  );
}

export function SemaineDuCalendrier({ children }: { readonly children: ReactNode }): ReactElement {
  return (
    <div role="row" className={CALENDRIER.semaine}>
      {children}
    </div>
  );
}

/** Une case : un seul arrêt de tabulation pour toute la grille (tabindex itinérant, AC20). */
export function CaseDuCalendrier(props: {
  readonly jour: string;
  readonly nom: string;
  readonly numero: string;
  readonly horsDuMois: boolean;
  readonly aujourdhui: boolean;
  readonly focalisable: boolean;
  readonly commandeDeLigne: ReactNode;
  readonly children: ReactNode;
}): ReactElement {
  const classe = props.aujourdhui
    ? CALENDRIER.caseAujourdhui
    : props.horsDuMois
      ? CALENDRIER.caseHorsDuMois
      : CALENDRIER.case;
  const numero = props.aujourdhui
    ? CALENDRIER.numeroAujourdhui
    : props.horsDuMois
      ? CALENDRIER.numeroHorsDuMois
      : CALENDRIER.numero;
  return (
    <div
      role="gridcell"
      data-jour={props.jour}
      data-hors-du-mois={props.horsDuMois ? "" : undefined}
      aria-label={props.nom}
      aria-current={props.aujourdhui ? "date" : undefined}
      tabIndex={props.focalisable ? 0 : -1}
      className={classe}
    >
      <div className={CALENDRIER.enteteDeCase}>
        <span className={numero} aria-hidden="true">
          {props.numero}
        </span>
        {props.commandeDeLigne}
      </div>
      <div className={CALENDRIER.entrees}>{props.children}</div>
    </div>
  );
}

/** Commande dans une case : hors de l'ordre de tabulation, atteinte au clavier par le menu de la case. */
export function CommandeDeCase(props: {
  readonly libelle: string;
  readonly nom?: string | undefined;
  readonly raison?: string | undefined;
  /** Reçoit le bouton activé : un menu s'ancre sur l'entrée qui le porte. */
  readonly surActivation: (declencheur: HTMLElement) => void;
}): ReactElement {
  return (
    <button
      type="button"
      tabIndex={-1}
      className={CALENDRIER.commande}
      aria-label={props.nom}
      disabled={props.raison !== undefined}
      title={props.raison}
      onClick={(evenement) => props.surActivation(evenement.currentTarget)}
    >
      {props.libelle}
    </button>
  );
}

/** Une entrée : focalisable (hors de l'ordre de tabulation), le libellé en texte ou son champ. */
export function EntreeDuCalendrier(props: {
  readonly ligne: string;
  readonly nom: string;
  readonly raccourcis: string | undefined;
  readonly contenu: ReactNode;
  readonly menu: ReactNode;
}): ReactElement {
  return (
    <div
      role="group"
      data-ligne={props.ligne}
      aria-label={props.nom}
      aria-keyshortcuts={props.raccourcis}
      tabIndex={-1}
      className={CALENDRIER.entree}
    >
      {props.contenu}
      {props.menu}
    </div>
  );
}

export function LibelleDEntree({ texte }: { readonly texte: string }): ReactElement {
  return <span className={CALENDRIER.libelle}>{texte}</span>;
}

export function PanneauDeCalendrier(props: {
  readonly titre: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <section aria-label={props.titre} className={CALENDRIER.panneau}>
      <h3 className={CALENDRIER.panneauTitre}>{props.titre}</h3>
      {props.children}
    </section>
  );
}

export function NoteDuPanneau({ texte }: { readonly texte: string }): ReactElement {
  return <p className={CALENDRIER.panneauVide}>{texte}</p>;
}

export function LignesDuPanneau({ children }: { readonly children: ReactNode }): ReactElement {
  return <ul className={CALENDRIER.lignes}>{children}</ul>;
}

/** Une ligne sans date : focalisable pour y recevoir le focus d'une date retirée (AC13). */
export function LigneDuPanneau(props: {
  readonly ligne: string;
  readonly nom: string;
  readonly libelle: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <li
      data-sans-date={props.ligne}
      aria-label={props.nom}
      tabIndex={-1}
      className={CALENDRIER.ligne}
    >
      <span className={CALENDRIER.ligneLibelle}>{props.libelle}</span>
      <span className={CALENDRIER.ligneCommandes}>{props.children}</span>
    </li>
  );
}
