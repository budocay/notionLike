// Composants de présentation des écrans des espaces (F-014) : écran, parties, tableaux à en-têtes de
// colonne, boutons et liens, choix d'un rôle, annonces, et boîtes de dialogue. Ils ne savent rien du
// serveur ni des droits : textes, états et actions leur sont donnés. Toute valeur est rendue comme
// du texte (F-014-AC33).
import {
  type FormEvent,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
  type Ref,
  type RefObject,
  useEffect,
  useId,
  useRef,
} from "react";

import { ESPACES } from "./compte.classes.ts";

export function EcranDEspaces(props: {
  readonly titre: string;
  readonly children: ReactNode;
}): ReactElement {
  const idTitre = useId();
  return (
    <div className={ESPACES.enveloppe}>
      <section aria-labelledby={idTitre} className={ESPACES.ecran}>
        <h1 id={idTitre} className={ESPACES.titre}>
          {props.titre}
        </h1>
        {props.children}
      </section>
    </div>
  );
}

export function Partie(props: {
  readonly titre: string;
  readonly children: ReactNode;
}): ReactElement {
  const idTitre = useId();
  return (
    <section aria-labelledby={idTitre} className={ESPACES.partie}>
      <h2 id={idTitre} className={ESPACES.intertitre}>
        {props.titre}
      </h2>
      {props.children}
    </section>
  );
}

export function Texte({ children }: { readonly children: ReactNode }): ReactElement {
  return <p className={ESPACES.texte}>{children}</p>;
}

/** Résultat d'une action, annoncé sans déplacer le focus (F-014-AC36). */
export function Annonce({ texte }: { readonly texte: string }): ReactElement {
  return (
    <p role="status" className={ESPACES.annonce}>
      {texte}
    </p>
  );
}

/** Échec, une phrase par élément, annoncé sans déplacer le focus. */
export function Alerte({ phrases }: { readonly phrases: readonly string[] }): ReactElement {
  return (
    <div role="alert" className={ESPACES.alerte}>
      {phrases.map((phrase) => (
        <p key={phrase}>{phrase}</p>
      ))}
    </div>
  );
}

export function Actions({ children }: { readonly children: ReactNode }): ReactElement {
  return <div className={ESPACES.actions}>{children}</div>;
}

interface ProprietesBouton {
  readonly libelle: string;
  /** Nom accessible, quand il cite ce qui est visé (F-014-AC36). */
  readonly nom?: string | undefined;
  readonly surActivation?: (() => void) | undefined;
  /** Raison d'une action permise mais momentanément impossible : le bouton est désactivé (AC29). */
  readonly raison?: string | undefined;
  readonly desactive?: boolean | undefined;
  readonly type?: "button" | "submit" | undefined;
  readonly refBouton?: Ref<HTMLButtonElement> | undefined;
}

export function Bouton(props: ProprietesBouton): ReactElement {
  const idRaison = useId();
  const raison = props.raison;
  return (
    <>
      <button
        ref={props.refBouton}
        type={props.type ?? "button"}
        className={ESPACES.bouton}
        aria-label={props.nom}
        disabled={raison !== undefined || props.desactive === true}
        aria-describedby={raison === undefined ? undefined : idRaison}
        onClick={props.surActivation}
      >
        {props.libelle}
      </button>
      {raison !== undefined && (
        <span id={idRaison} className={ESPACES.raison}>
          {raison}
        </span>
      )}
    </>
  );
}

export function Lien(props: {
  readonly libelle: string;
  readonly adresse: string;
  readonly nom?: string | undefined;
}): ReactElement {
  return (
    <a href={props.adresse} className={ESPACES.lien} aria-label={props.nom}>
      {props.libelle}
    </a>
  );
}

interface ProprietesTableau {
  readonly legende: string;
  readonly colonnes: readonly string[];
  readonly lignes: readonly { readonly cle: string; readonly cellules: readonly ReactNode[] }[];
  /** Le focus y revient quand la commande d'origine a disparu (F-014-AC36). */
  readonly refTableau?: Ref<HTMLTableElement> | undefined;
}

export function Tableau(props: ProprietesTableau): ReactElement {
  return (
    <table ref={props.refTableau} tabIndex={-1} className={ESPACES.tableau}>
      <caption className={ESPACES.legende}>{props.legende}</caption>
      <thead>
        <tr>
          {props.colonnes.map((colonne) => (
            <th key={colonne} scope="col" className={ESPACES.entete}>
              {colonne}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {props.lignes.map((ligne) => (
          <tr key={ligne.cle}>
            {ligne.cellules.map((cellule, rang) => (
              <td key={props.colonnes[rang]} className={ESPACES.cellule}>
                {cellule}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

interface ProprietesChoix {
  readonly nom: string;
  readonly valeur: string;
  readonly options: readonly { readonly valeur: string; readonly libelle: string }[];
  readonly surChoix: (valeur: string) => void;
  readonly raison?: string | undefined;
}

export function Choix(props: ProprietesChoix): ReactElement {
  const idRaison = useId();
  return (
    <>
      <select
        aria-label={props.nom}
        className={ESPACES.choix}
        value={props.valeur}
        disabled={props.raison !== undefined}
        aria-describedby={props.raison === undefined ? undefined : idRaison}
        onChange={(evenement) => props.surChoix(evenement.target.value)}
      >
        {props.options.map((option) => (
          <option key={option.valeur} value={option.valeur}>
            {option.libelle}
          </option>
        ))}
      </select>
      {props.raison !== undefined && (
        <span id={idRaison} className={ESPACES.raison}>
          {props.raison}
        </span>
      )}
    </>
  );
}

/** Formulaire envoyé par Entrée ; Échap l'abandonne sans requête (F-014-AC9, AC35). */
export function Formulaire(props: {
  readonly nom: string;
  readonly surEnvoi: () => void;
  readonly surEchap?: (() => void) | undefined;
  readonly children: ReactNode;
}): ReactElement {
  const envoyer = (evenement: FormEvent): void => {
    evenement.preventDefault();
    props.surEnvoi();
  };
  const touche = (evenement: KeyboardEvent): void => {
    if (evenement.key === ECHAP && props.surEchap !== undefined) {
      evenement.preventDefault();
      props.surEchap();
    }
  };
  return (
    <form
      noValidate
      aria-label={props.nom}
      className={ESPACES.formulaire}
      onSubmit={envoyer}
      onKeyDown={touche}
    >
      {props.children}
    </form>
  );
}

/** Lien affiché en lecture seule, sélectionné, quand la copie n'a pas pu se faire (F-014-AC18). */
export function LienEnLecture(props: {
  readonly etiquette: string;
  readonly valeur: string;
}): ReactElement {
  const id = useId();
  const champ = useRef<HTMLInputElement>(null);
  useEffect(() => {
    champ.current?.focus();
    champ.current?.select();
  }, []);
  return (
    <>
      <label htmlFor={id} className={ESPACES.raison}>
        {props.etiquette}
      </label>
      <input id={id} ref={champ} readOnly className={ESPACES.lienLu} value={props.valeur} />
    </>
  );
}

const ECHAP = "Escape";
const FOCALISABLES =
  "button:not([disabled]), input:not([disabled]), select:not([disabled]), a[href], textarea:not([disabled])";

interface ProprietesBoite {
  /** Vrai : boîte d'alerte, qui demande une confirmation (F-014-AC36). */
  readonly alerte: boolean;
  readonly titre: string;
  readonly phrases: readonly string[];
  /** Élément qui reçoit le focus à l'ouverture : « Annuler » pour une alerte. */
  readonly initial: RefObject<HTMLElement | null>;
  readonly surFermeture: () => void;
  readonly children: ReactNode;
}

/**
 * Boîte de dialogue modale : focus posé à l'ouverture, Échap la ferme. Le focus y est retenu par
 * deux bornes : atteinte par Tab ou Maj+Tab, chacune le renvoie à l'autre bout de la boîte.
 */
export function BoiteDeDialogue(props: ProprietesBoite): ReactElement {
  const idTitre = useId();
  const idTexte = useId();
  const boite = useRef<HTMLDivElement>(null);
  const { initial } = props;
  useEffect(() => {
    initial.current?.focus();
  }, [initial]);
  const touche = (evenement: KeyboardEvent): void => {
    if (evenement.key === ECHAP) {
      evenement.preventDefault();
      evenement.stopPropagation();
      props.surFermeture();
    }
  };
  return (
    <div className={ESPACES.plan}>
      <div className={ESPACES.voile} />
      <div
        ref={boite}
        role={props.alerte ? "alertdialog" : "dialog"}
        aria-modal="true"
        aria-labelledby={idTitre}
        aria-describedby={idTexte}
        className={ESPACES.boite}
        onKeyDown={touche}
      >
        <Borne boite={boite} vers="dernier" />
        <h2 id={idTitre} className={ESPACES.intertitre}>
          {props.titre}
        </h2>
        <div id={idTexte} className={ESPACES.formulaire}>
          {props.phrases.map((phrase) => (
            <p key={phrase} className={ESPACES.texte}>
              {phrase}
            </p>
          ))}
        </div>
        {props.children}
        <Borne boite={boite} vers="premier" />
      </div>
    </div>
  );
}

/** Borne de la boîte : elle ne garde jamais le focus, elle le passe au premier ou au dernier élément. */
function Borne(props: {
  readonly boite: RefObject<HTMLDivElement | null>;
  readonly vers: "premier" | "dernier";
}): ReactElement {
  const renvoyer = (): void => {
    const elements = [...(props.boite.current?.querySelectorAll<HTMLElement>(FOCALISABLES) ?? [])];
    (props.vers === "premier" ? elements[0] : elements.at(-1))?.focus();
  };
  return <span tabIndex={0} aria-hidden="true" onFocus={renvoyer} />;
}
