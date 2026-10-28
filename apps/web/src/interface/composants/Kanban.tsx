// Composants de présentation de la vue kanban (F-020) : ils ne savent rien du document de table. Les
// textes, les états et les actions leur sont donnés par le module des vues de table, et toute valeur
// (titre, libellé) est rendue comme du texte (F-020-AC22).
import type { DOMAttributes, KeyboardEvent, ReactElement, ReactNode, RefObject } from "react";

import { BoutonIcone } from "./BoutonIcone.tsx";
import { KANBAN } from "./kanban.classes.ts";

export function PlateauDeKanban(props: {
  readonly nom: string;
  readonly refCadre: RefObject<HTMLDivElement | null>;
  readonly surTouche: (evenement: KeyboardEvent<HTMLElement>) => void;
  /** Menu d'une carte, posé sur le cadre pour ne pas être coupé par la zone défilante des piles. */
  readonly flottante?: ReactNode | undefined;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <div
      ref={props.refCadre}
      role="group"
      aria-label={props.nom}
      tabIndex={-1}
      className={KANBAN.cadre}
      onKeyDown={props.surTouche}
    >
      <div className={KANBAN.plateau}>{props.children}</div>
      {props.flottante}
    </div>
  );
}

export function PileDeKanban(props: {
  /** Nom du groupe : le libellé de la pile et le nombre de ses cartes (AC21). */
  readonly nom: string;
  readonly libelle: string;
  readonly nombre: number;
  readonly vide: string;
  readonly refZone: (element: HTMLElement | null) => void;
  /** Vrai quand le geste survole la pile elle-même : en tête, en fin ou vide (AC12). */
  readonly survolee: boolean;
  /**
   * Vrai : la carte lâchée sur la pile elle-même part en fin de pile (pile non vide, sans tri). Le repère
   * est alors un trait après la dernière carte, pas un contour de toute la pile (AC12).
   */
  readonly repereEnFin: boolean;
  readonly children: ReactNode;
  readonly pied: ReactNode;
}): ReactElement {
  const enFin = props.survolee && props.repereEnFin;
  return (
    <section
      ref={props.refZone}
      role="group"
      aria-label={props.nom}
      className={props.survolee && !enFin ? KANBAN.pileSurvolee : KANBAN.pile}
    >
      <div className={KANBAN.enTete}>
        <span className={KANBAN.titreDePile}>{props.libelle}</span>
        <span className={KANBAN.nombre}>{props.nombre}</span>
      </div>
      {props.nombre === 0 && <p className={KANBAN.vide}>{props.vide}</p>}
      <ul className={KANBAN.cartes}>{props.children}</ul>
      {enFin && <span className={KANBAN.depotFin} />}
      <div className={KANBAN.pied}>{props.pied}</div>
    </section>
  );
}

/** Ce que le glisser-déposer pose sur la carte (F-020-AC12, AC25). */
export interface GlisserDeCarte {
  readonly ref: (element: HTMLElement | null) => void;
  readonly ecouteursDuPointeur: Pick<DOMAttributes<HTMLElement>, "onPointerDown">;
  readonly idDesInstructions: string;
  readonly deplacement: string | undefined;
  readonly enGlissement: boolean;
  readonly zone: "avant" | "apres" | "dans" | undefined;
}

export interface ProprietesCarte {
  /** Identifiant de la ligne : le clavier du plateau retrouve la carte qui a le focus. */
  readonly identifiant: string;
  /** Titre à afficher ; il est aussi le nom du groupe que la carte forme. */
  readonly titre: string;
  readonly vide: boolean;
  /** Place dans la pile entière, pour les technologies d'assistance (AC15). */
  readonly rang: number;
  readonly total: number;
  /** Seule la carte courante est dans l'ordre de tabulation : un seul arrêt (AC15). */
  readonly courante: boolean;
  readonly raccourcis: string;
  readonly glisser: GlisserDeCarte;
  readonly refCarte: (element: HTMLElement | null) => void;
  readonly surFocus: () => void;
  /** Saisie du titre, affichée à la place du titre. */
  readonly saisie?: ReactNode | undefined;
  readonly nomDesActions: string;
  readonly menuOuvert: boolean;
  readonly surActions: (evenement: { readonly currentTarget: HTMLElement }) => void;
}

export function CarteDeKanban(props: ProprietesCarte): ReactElement {
  const { glisser } = props;
  return (
    <li
      ref={glisser.ref}
      aria-posinset={props.rang}
      aria-setsize={props.total}
      className={glisser.enGlissement ? KANBAN.carteGlissee : KANBAN.carte}
      style={glisser.deplacement === undefined ? undefined : { transform: glisser.deplacement }}
      {...glisser.ecouteursDuPointeur}
    >
      {glisser.zone === "avant" && <span className={KANBAN.depotAvant} />}
      <div
        ref={props.refCarte}
        data-carte={props.identifiant}
        role="group"
        aria-label={props.titre}
        aria-describedby={glisser.idDesInstructions}
        aria-keyshortcuts={props.raccourcis}
        tabIndex={props.courante ? 0 : -1}
        className={KANBAN.contenu}
        onFocus={props.surFocus}
      >
        {props.saisie ?? (
          <span className={props.vide ? KANBAN.titreVide : KANBAN.titreDeCarte}>{props.titre}</span>
        )}
        <span className={KANBAN.actions}>
          <BoutonIcone
            nom={props.nomDesActions}
            pictogramme="points"
            lieu="rangee"
            tabIndex={-1}
            aria-haspopup="menu"
            aria-expanded={props.menuOuvert}
            onClick={props.surActions}
          />
        </span>
      </div>
      {glisser.zone === "apres" && <span className={KANBAN.depotApres} />}
    </li>
  );
}
