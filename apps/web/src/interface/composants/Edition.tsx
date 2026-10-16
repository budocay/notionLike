import {
  type CSSProperties,
  type FocusEvent,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
  type Ref,
  useEffect,
  useId,
  useRef,
  useState,
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
  /**
   * Région d'état de l'éditeur, hors de la vue : ce que le clavier n'a pas pu faire (F-006-AC18,
   * AC28). Absente : aucune région.
   */
  readonly annonce?: string | undefined;
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
      {props.annonce !== undefined && (
        <p role="status" className={EDITION.annonce}>
          {props.annonce}
        </p>
      )}
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
  /** Vrai si le bloc courant est de ce type, ou si le texte du curseur porte cette marque. */
  readonly active: boolean;
  /** Vrai : la commande est exposée, mais rien ne se passe à son activation (F-028-AC6). */
  readonly indisponible?: boolean | undefined;
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
          aria-disabled={commande.indisponible === true ? true : undefined}
          title={commande.nom}
          tabIndex={-1}
          onMouseDown={garderLeFocus}
          onClick={commande.indisponible === true ? undefined : commande.surActivation}
        >
          <span aria-hidden="true">{commande.repere}</span>
        </button>
      ))}
    </div>
  );
}

/** Classe du curseur de dépôt de l'éditeur : sa couleur vient des jetons (F-006-AC37). */
export const CLASSE_DU_CURSEUR_DE_DEPOT = EDITION.curseurDeDepot;

interface ProprietesPoignee {
  /** Nom accessible, « Déplacer le bloc ». */
  readonly nom: string;
  /** Les raccourcis qui déplacent le bloc, pour `aria-keyshortcuts`. */
  readonly raccourcis?: string | undefined;
}

const SIGNE_DE_LA_POIGNEE = "⋮⋮";

/**
 * Poignée d'un bloc (F-006-AC14, AC28), que la poignée de l'éditeur place au survol : on la saisit
 * pour faire glisser le bloc. Hors de l'ordre de tabulation : au clavier, les raccourcis et la barre
 * de blocs déplacent le bloc.
 */
export function PoigneeDeBloc({ nom, raccourcis }: ProprietesPoignee): ReactElement {
  return (
    <button
      type="button"
      className={EDITION.poignee}
      aria-label={nom}
      aria-keyshortcuts={raccourcis}
      title={nom}
      tabIndex={-1}
      data-poignee-de-bloc=""
    >
      <span aria-hidden="true">{SIGNE_DE_LA_POIGNEE}</span>
    </button>
  );
}

/**
 * La même poignée, au bloc où se trouve le curseur, quand le pointeur n'en montre aucune
 * (F-006-AC14) : elle ne se glisse pas ; activée, elle mène aux commandes de déplacement du bloc,
 * sans que la pression du pointeur ôte le focus à la zone de saisie.
 */
export function PoigneeDuCurseur(
  props: ProprietesPoignee & {
    readonly haut: number;
    /** Ce que l'activation fait : sans elle, la poignée n'est que montrée (démonstration). */
    readonly surActivation?: (() => void) | undefined;
  },
): ReactElement {
  return (
    <button
      type="button"
      className={EDITION.poigneeDuCurseur}
      // Géométrie seule, mesurée par le module d'édition (F-006-AC37).
      style={{ top: props.haut }}
      aria-label={props.nom}
      aria-keyshortcuts={props.raccourcis}
      title={props.nom}
      tabIndex={-1}
      data-poignee-du-curseur=""
      onMouseDown={garderLeFocus}
      onClick={props.surActivation}
    >
      <span aria-hidden="true">{SIGNE_DE_LA_POIGNEE}</span>
    </button>
  );
}

interface ProprietesPanneauDeLien {
  readonly nom: string;
  readonly etiquette: string;
  readonly appliquer: string;
  readonly ouvrir: string;
  readonly retirer: string;
  readonly messageDeRefus: string;
  /** L'adresse enregistrée du lien visé : du texte, jamais interprété (F-028-AC17). */
  readonly adresseEnregistree: string;
  /**
   * Forme normalisée d'une adresse acceptée : « Ouvrir le lien » est un élément `a` aux attributs
   * imposés (F-028-AC10, AC16) ; `undefined` : la commande est indisponible.
   */
  readonly adresseAOuvrir: string | undefined;
  readonly retirable: boolean;
  /** Vrai après une adresse refusée : le message est rattaché au champ et annoncé (F-028-AC12). */
  readonly refuse: boolean;
  readonly position: PositionDeBarre;
  readonly surValidation: (saisie: string) => void;
  readonly surRetrait: () => void;
  /** Échap : le panneau se ferme sans rien modifier. */
  readonly surAbandon: () => void;
}

const ATTRIBUTS_D_OUVERTURE = { rel: "noopener noreferrer", target: "_blank" } as const;

interface ProprietesActionsDuLien {
  readonly appliquer: string;
  readonly ouvrir: string;
  readonly retirer: string;
  readonly adresseAOuvrir: string | undefined;
  readonly retirable: boolean;
  readonly surRetrait: () => void;
}

// « Ouvrir le lien » est un élément `a` : son activation, et rien d'autre, ouvre l'adresse.
function ActionsDuLien(props: ProprietesActionsDuLien): ReactElement {
  return (
    <div className={EDITION.actions}>
      <button type="submit" className={EDITION.action}>
        {props.appliquer}
      </button>
      {props.adresseAOuvrir === undefined ? (
        <button type="button" className={EDITION.action} aria-disabled="true">
          {props.ouvrir}
        </button>
      ) : (
        <a className={EDITION.action} href={props.adresseAOuvrir} {...ATTRIBUTS_D_OUVERTURE}>
          {props.ouvrir}
        </a>
      )}
      <button
        type="button"
        className={EDITION.action}
        aria-disabled={props.retirable ? undefined : "true"}
        onClick={props.retirable ? props.surRetrait : undefined}
      >
        {props.retirer}
      </button>
    </div>
  );
}

function surToucheDuPanneau(evenement: KeyboardEvent<HTMLFormElement>, surAbandon: () => void) {
  if (evenement.key === ABANDON) {
    evenement.preventDefault();
    surAbandon();
  }
}

/**
 * Panneau de lien (F-028-AC6, AC7, AC27) : affiché avec la barre de blocs, sous elle. Le champ prend
 * le focus à l'ouverture ; Entrée valide, Échap ferme. Il ne porte aucune logique d'édition.
 */
export function PanneauDeLien(props: ProprietesPanneauDeLien): ReactElement {
  const { position, refuse } = props;
  const [saisie, setSaisie] = useState(props.adresseEnregistree);
  const champ = useRef<HTMLInputElement>(null);
  const identifiant = useId();
  const [idDuChamp, idDuRefus] = [`${identifiant}-champ`, `${identifiant}-refus`];
  useEffect(() => champ.current?.focus(), []);
  const style = { "--barre-gauche": position.gauche, "--barre-haut": position.haut };
  const valider = (evenement: FormEvent<HTMLFormElement>): void => {
    evenement.preventDefault();
    props.surValidation(saisie);
  };
  return (
    <form
      className={EDITION.panneau}
      style={style as CSSProperties}
      aria-label={props.nom}
      noValidate
      onSubmit={valider}
      onKeyDown={(evenement) => surToucheDuPanneau(evenement, props.surAbandon)}
    >
      <label className={EDITION.etiquette} htmlFor={idDuChamp}>
        {props.etiquette}
      </label>
      <input
        ref={champ}
        id={idDuChamp}
        className={EDITION.champ}
        type="text"
        inputMode="url"
        autoComplete="off"
        spellCheck={false}
        value={saisie}
        aria-invalid={refuse ? true : undefined}
        aria-describedby={refuse ? idDuRefus : undefined}
        onChange={(evenement) => setSaisie(evenement.target.value)}
      />
      {refuse && (
        <p id={idDuRefus} className={EDITION.refus} role="alert">
          {props.messageDeRefus}
        </p>
      )}
      <ActionsDuLien {...props} />
    </form>
  );
}
