// Composants de présentation de l'écran de table (F-018) : ils ne savent rien du document de table.
// Textes, états, géométrie et actions leur sont donnés par le module des vues de table, et toute
// valeur est rendue comme du texte (AC38). Les seuls styles en ligne sont la géométrie que la
// fenêtre et les largeurs calculent : `width`, `height`, `transform` (AC55).
import {
  type ComponentProps,
  type FocusEvent,
  type KeyboardEvent,
  type PointerEvent,
  type ReactElement,
  type ReactNode,
  type Ref,
  type UIEvent,
  useId,
} from "react";

import { Pictogramme } from "./Pictogramme.tsx";
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

/** Sélecteur de vues (AC44) : une vue par bouton, l'active marquée par `aria-pressed` et un souligné. */
export function SelecteurDeVues(props: {
  readonly nom: string;
  readonly vues: readonly { readonly id: string; readonly libelle: string }[];
  readonly active: string;
  readonly surChoix: (id: string) => void;
}): ReactElement {
  return (
    <div role="group" aria-label={props.nom} className={TABLE.vues}>
      {props.vues.map((vue) => (
        <button
          key={vue.id}
          type="button"
          aria-pressed={vue.id === props.active}
          className={vue.id === props.active ? TABLE.vueActive : TABLE.vue}
          onClick={() => props.surChoix(vue.id)}
        >
          {vue.libelle}
        </button>
      ))}
    </div>
  );
}

// ── Grille ───────────────────────────────────────────────────────────────────────────────────────

interface ProprietesGrille {
  readonly nom: string;
  /** Lignes affichées plus la rangée d'en-têtes, quelle que soit la fenêtre (AC34). */
  readonly nombreDeRangees: number;
  readonly nombreDeColonnes: number;
  /** Largeur de toutes les colonnes, en pixels. */
  readonly largeur: number;
  /** Hauteur de toutes les lignes, en pixels. */
  readonly hauteurDuCorps: number;
  /** Hauteur de la zone défilante : celle du contenu, bornée par la fenêtre du navigateur. */
  readonly hauteurDeLaZone: string;
  readonly refDefilement: Ref<HTMLDivElement>;
  readonly refCadre: Ref<HTMLDivElement>;
  readonly surDefilement: (evenement: UIEvent<HTMLDivElement>) => void;
  readonly surTouche: (evenement: KeyboardEvent<HTMLDivElement>) => void;
  /** Focus arrivant sur un élément de la grille, lu avant la cellule qui le reçoit. */
  readonly surFocus: (evenement: FocusEvent<HTMLDivElement>) => void;
  readonly enTetes: ReactNode;
  readonly rangees: ReactNode;
  /** Menu, liste de choix : posés au-dessus de la zone défilante. */
  readonly flottante?: ReactNode | undefined;
}

export function Grille(props: ProprietesGrille): ReactElement {
  return (
    <div ref={props.refCadre} className={TABLE.cadre}>
      <div
        role="grid"
        aria-label={props.nom}
        aria-rowcount={props.nombreDeRangees}
        aria-colcount={props.nombreDeColonnes}
        className={TABLE.grille}
        onKeyDown={props.surTouche}
        onFocusCapture={props.surFocus}
      >
        <div
          ref={props.refDefilement}
          className={TABLE.defilement}
          style={{ height: props.hauteurDeLaZone }}
          onScroll={props.surDefilement}
        >
          <div role="rowgroup" className={TABLE.enTetes} style={{ width: props.largeur }}>
            {props.enTetes}
          </div>
          <div
            role="rowgroup"
            className={TABLE.corps}
            style={{ width: props.largeur, height: props.hauteurDuCorps }}
          >
            {props.rangees}
          </div>
        </div>
      </div>
      {props.flottante}
    </div>
  );
}

/** Rangée d'en-têtes : la première de la grille. */
export function RangeeDEnTetes(props: {
  readonly hauteur: number;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <div
      role="row"
      aria-rowindex={1}
      style={{ height: props.hauteur }}
      className={TABLE.enTetesRangee}
    >
      {props.children}
    </div>
  );
}

/** Une ligne affichée, placée par `transform` à sa hauteur dans la liste (AC46). */
export function RangeeDeGrille(props: {
  /** Indice ARIA de la rangée, en-têtes comptés : 2 pour la première ligne. */
  readonly indice: number;
  readonly decalage: number;
  readonly hauteur: number;
  readonly largeur: number;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <div
      role="row"
      aria-rowindex={props.indice}
      className={TABLE.rangee}
      style={{
        width: props.largeur,
        height: props.hauteur,
        transform: `translateY(${String(props.decalage)}px)`,
      }}
    >
      {props.children}
    </div>
  );
}

interface ProprietesCellule {
  readonly role: "gridcell" | "columnheader" | "rowheader";
  readonly indiceDeColonne: number;
  readonly largeur: number;
  /** Seule la cellule courante est dans l'ordre de tabulation (tabindex itinérant, AC33). */
  readonly courante: boolean;
  readonly refCellule: (element: HTMLElement | null) => void;
  readonly surFocus: () => void;
  readonly surDoubleClic?: (() => void) | undefined;
  readonly nom?: string | undefined;
  readonly description?: string | undefined;
  readonly sorte?: "donnee" | "actions" | undefined;
  /** Combinaisons disponibles depuis la cellule (`aria-keyshortcuts`), sans entrer dans son nom. */
  readonly raccourcis?: string | undefined;
  readonly children?: ReactNode | undefined;
}

export function CelluleDeGrille(props: ProprietesCellule): ReactElement {
  const classe =
    props.sorte === "actions"
      ? TABLE.celluleDActions
      : props.role === "columnheader"
        ? TABLE.enTete
        : TABLE.cellule;
  return (
    <div
      ref={props.refCellule}
      role={props.role}
      aria-colindex={props.indiceDeColonne}
      aria-label={props.nom}
      aria-describedby={props.description}
      aria-keyshortcuts={props.raccourcis}
      tabIndex={props.courante ? 0 : -1}
      className={classe}
      style={{ width: props.largeur }}
      onFocus={(evenement: FocusEvent<HTMLDivElement>) => {
        if (evenement.target === evenement.currentTarget) {
          props.surFocus();
        }
      }}
      onDoubleClick={props.surDoubleClic}
    >
      {props.children}
    </div>
  );
}

/** Texte d'une cellule ou d'un en-tête, sur une ligne, coupé par des points de suspension (AC26). */
export function TexteDeCellule({ texte }: { readonly texte: string }): ReactElement {
  return <span className={TABLE.texte}>{texte}</span>;
}

/**
 * Case d'une cellule `case` : cochée par Espace sur la cellule ou par un clic, sans mode édition. La
 * case ne garde pas le focus qu'un clic lui donne : il revient à sa cellule, qui devient la cellule
 * courante, et les flèches en partent (tabindex itinérant, AC33).
 */
export function CaseDeCellule(props: {
  readonly nom: string;
  readonly cochee: boolean;
  readonly surBascule: () => void;
  readonly raison?: string | undefined;
}): ReactElement {
  return (
    <input
      type="checkbox"
      className={TABLE.caseACocher}
      tabIndex={-1}
      aria-label={props.nom}
      checked={props.cochee}
      disabled={props.raison !== undefined}
      onChange={props.surBascule}
      onFocus={(evenement) =>
        evenement.currentTarget.closest<HTMLElement>('[role="gridcell"]')?.focus()
      }
    />
  );
}

interface ProprietesChampDeCellule extends Omit<
  ComponentProps<"input">,
  "className" | "aria-label" | "aria-invalid" | "aria-describedby" | "ref"
> {
  readonly nom: string;
  /** Identifiant du message de refus affiché au-dessus de la grille ; absent, le champ est valide. */
  readonly idFaute?: string | undefined;
  readonly refChamp?: Ref<HTMLInputElement> | undefined;
}

export function ChampDeCellule(props: ProprietesChampDeCellule): ReactElement {
  const { nom, idFaute, refChamp, ...natives } = props;
  return (
    <input
      ref={refChamp}
      className={idFaute === undefined ? TABLE.champ : TABLE.champEnErreur}
      aria-label={nom}
      aria-invalid={idFaute !== undefined}
      aria-describedby={idFaute}
      {...natives}
    />
  );
}

/** Séparateur de largeur d'une colonne (AC43) : glissé au pointeur, ou réglé par les flèches. */
export function SeparateurDeColonne(props: {
  readonly nom: string;
  readonly valeur: number;
  readonly min: number;
  readonly max: number;
  readonly refSeparateur: (element: HTMLDivElement | null) => void;
  readonly surTouche: (evenement: KeyboardEvent<HTMLDivElement>) => void;
  readonly surAppui: (evenement: PointerEvent<HTMLDivElement>) => void;
  readonly surGlisse: (evenement: PointerEvent<HTMLDivElement>) => void;
  readonly surLacher: (evenement: PointerEvent<HTMLDivElement>) => void;
}): ReactElement {
  return (
    <div
      ref={props.refSeparateur}
      role="separator"
      aria-orientation="vertical"
      aria-label={props.nom}
      aria-valuenow={props.valeur}
      aria-valuemin={props.min}
      aria-valuemax={props.max}
      tabIndex={-1}
      className={TABLE.separateur}
      onKeyDown={props.surTouche}
      onPointerDown={props.surAppui}
      onPointerMove={props.surGlisse}
      onPointerUp={props.surLacher}
      onPointerCancel={props.surLacher}
    />
  );
}

/**
 * Couche posée sur la commande qui l'ouvre, au-dessus de la zone défilante, qui ne la coupe pas :
 * elle reçoit la géométrie de la commande (décalage et taille), son contenu se place sous elle.
 */
export function SurfaceFlottante(props: {
  readonly x: number;
  readonly y: number;
  readonly largeur: number;
  readonly hauteur: number;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <div
      className={TABLE.flottante}
      style={{
        width: props.largeur,
        height: props.hauteur,
        transform: `translate(${String(props.x)}px, ${String(props.y)}px)`,
      }}
    >
      <div className={TABLE.flottanteContenu}>{props.children}</div>
    </div>
  );
}

export interface ChoixDeListe {
  readonly cle: string;
  readonly libelle: string;
  readonly courant: boolean;
}

/**
 * Liste des choix d'une cellule `selection` (AC31) : la sélection suit l'option active (une seule
 * option `aria-selected`, celle qu'Entrée choisirait), et la valeur courante de la cellule est
 * marquée à part, d'une coche et de `aria-current`.
 */
export function ListeDeChoix(props: {
  readonly id: string;
  readonly nom: string;
  readonly choix: readonly ChoixDeListe[];
  readonly active: number;
  readonly refListe: Ref<HTMLDivElement>;
  readonly surTouche: (evenement: KeyboardEvent<HTMLDivElement>) => void;
  readonly surChoix: (rang: number) => void;
  readonly surSortie: (evenement: FocusEvent<HTMLDivElement>) => void;
}): ReactElement {
  return (
    <div
      ref={props.refListe}
      role="listbox"
      tabIndex={-1}
      aria-label={props.nom}
      aria-activedescendant={`${props.id}-${String(props.active)}`}
      className={TABLE.choix}
      onKeyDown={props.surTouche}
      onBlur={props.surSortie}
    >
      {props.choix.map((choix, rang) => (
        <div
          key={choix.cle}
          id={`${props.id}-${String(rang)}`}
          role="option"
          aria-selected={rang === props.active}
          aria-current={choix.courant ? "true" : undefined}
          className={rang === props.active ? TABLE.optionActive : TABLE.option}
          onMouseDown={(evenement) => evenement.preventDefault()}
          onClick={() => props.surChoix(rang)}
        >
          <span className={choix.courant ? TABLE.optionCourante : undefined}>{choix.libelle}</span>
          {choix.courant && <Pictogramme nom="coche" />}
        </div>
      ))}
    </div>
  );
}

// ── Formulaires des boîtes ───────────────────────────────────────────────────────────────────────

interface ProprietesChampDeFormulaire extends Omit<
  ComponentProps<"input">,
  "id" | "className" | "ref" | "aria-invalid" | "aria-describedby"
> {
  readonly etiquette: string;
  readonly faute?: string | undefined;
  readonly refChamp?: Ref<HTMLInputElement> | undefined;
}

export function ChampDeFormulaire(props: ProprietesChampDeFormulaire): ReactElement {
  const { etiquette, faute, refChamp, ...natives } = props;
  const id = useId();
  const idFaute = useId();
  return (
    <div className={TABLE.champDeFormulaire}>
      <label htmlFor={id} className={TABLE.etiquette}>
        {etiquette}
      </label>
      <input
        id={id}
        ref={refChamp}
        className={TABLE.saisie}
        aria-invalid={faute !== undefined}
        aria-describedby={faute === undefined ? undefined : idFaute}
        {...natives}
      />
      {faute !== undefined && (
        <span id={idFaute} role="alert" className={TABLE.faute}>
          {faute}
        </span>
      )}
    </div>
  );
}

/** Liste des options d'une colonne dans son panneau (AC22). */
export function ListeDOptions(props: {
  readonly nom: string;
  readonly vide: string;
  readonly children: ReactNode;
  readonly nombre: number;
}): ReactElement {
  return props.nombre === 0 ? (
    <p className={TABLE.note}>{props.vide}</p>
  ) : (
    <ul aria-label={props.nom} className={TABLE.options}>
      {props.children}
    </ul>
  );
}

export function LigneDOption({ children }: { readonly children: ReactNode }): ReactElement {
  return <li className={TABLE.ligneDOption}>{children}</li>;
}
