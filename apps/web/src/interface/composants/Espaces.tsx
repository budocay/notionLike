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
      {phrases.map((phrase, rang) => (
        <p key={`${String(rang)}:${phrase}`}>{phrase}</p>
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
  /** Hors de l'ordre de tabulation (-1) : un arrêt d'une composition à flèches (F-020-AC15). */
  readonly tabIndex?: number | undefined;
  readonly surFocus?: (() => void) | undefined;
  /** Identifiant de l'arrêt que ce bouton forme dans une composition à flèches (F-020-AC15). */
  readonly arret?: string | undefined;
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
        tabIndex={props.tabIndex}
        onFocus={props.surFocus}
        data-arret={props.arret}
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
  /** Vrai : titre d'une rangée, sur une ligne, coupé par des points de suspension (F-032-AC30). */
  readonly coupe?: boolean | undefined;
}): ReactElement {
  return props.coupe === true ? (
    <a href={props.adresse} className={ESPACES.lienDeRangee} aria-label={props.nom}>
      <span className={ESPACES.titreCoupe}>{props.libelle}</span>
    </a>
  ) : (
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

/** Formulaire envoyé par Entrée ; ses touches (Échap) sont lues par qui le rend (F-014-AC9, AC35). */
export function Formulaire(props: {
  readonly nom: string;
  readonly surEnvoi: () => void;
  readonly surTouche?: ((evenement: KeyboardEvent<HTMLElement>) => void) | undefined;
  readonly children: ReactNode;
}): ReactElement {
  const envoyer = (evenement: FormEvent): void => {
    evenement.preventDefault();
    props.surEnvoi();
  };
  return (
    <form
      noValidate
      aria-label={props.nom}
      className={ESPACES.formulaire}
      onSubmit={envoyer}
      onKeyDown={props.surTouche}
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

interface ProprietesBoite {
  /** Vrai : boîte d'alerte, qui demande une confirmation (F-014-AC36). */
  readonly alerte: boolean;
  readonly titre: string;
  readonly phrases: readonly string[];
  /** Élément qui reçoit le focus à l'ouverture : « Annuler » pour une alerte. */
  readonly initial: RefObject<HTMLElement | null>;
  /** Touches de la boîte (Échap, Tab, Maj+Tab), lues par qui la rend. */
  readonly surTouche: (evenement: KeyboardEvent<HTMLElement>) => void;
  /** Vrai sur la page de démonstration : la boîte est montrée sans rendre la page inerte. */
  readonly apercu?: boolean | undefined;
  readonly children: ReactNode;
}

/**
 * Boîte de dialogue modale : focus posé à l'ouverture ; tant qu'elle est ouverte, tout le reste de
 * la page est inerte (ni focus, ni pointeur, ni technologies d'assistance), sans élément caché.
 */
export function BoiteDeDialogue(props: ProprietesBoite): ReactElement {
  const idTitre = useId();
  const idTexte = useId();
  const plan = useRef<HTMLDivElement>(null);
  const { initial, apercu } = props;
  useEffect(() => {
    const restaurer =
      apercu === true || plan.current === null ? undefined : rendreLeResteInerte(plan.current);
    initial.current?.focus();
    return restaurer;
  }, [initial, apercu]);
  return (
    <div ref={plan} className={ESPACES.plan}>
      <div className={ESPACES.voile} />
      <div
        role={props.alerte ? "alertdialog" : "dialog"}
        aria-modal="true"
        aria-labelledby={idTitre}
        aria-describedby={idTexte}
        className={ESPACES.boite}
        onKeyDown={props.surTouche}
      >
        <h2 id={idTitre} className={ESPACES.intertitre}>
          {props.titre}
        </h2>
        <div id={idTexte} className={ESPACES.formulaire}>
          {props.phrases.map((phrase, rang) => (
            <p key={`${String(rang)}:${phrase}`} className={ESPACES.texte}>
              {phrase}
            </p>
          ))}
        </div>
        {props.children}
      </div>
    </div>
  );
}

const INERTE = "inert";

/** Pose `inert` sur chaque frère de la boîte et de ses ancêtres ; rend de quoi le retirer. */
function rendreLeResteInerte(plan: HTMLElement): () => void {
  const poses: Element[] = [];
  for (let noeud: Element | null = plan; noeud !== null && noeud !== document.body;) {
    const parent: Element | null = noeud.parentElement;
    for (const frere of parent?.children ?? []) {
      if (frere !== noeud && !frere.hasAttribute(INERTE)) {
        frere.setAttribute(INERTE, "");
        poses.push(frere);
      }
    }
    noeud = parent;
  }
  return () => poses.forEach((element) => element.removeAttribute(INERTE));
}

/** Une rangée de l'écran des espaces (F-032-AC30). */
export interface RangeeDEspace {
  readonly cle: string;
  /** Le titre, coupé par des points de suspension quand la place manque. */
  readonly nom: string;
  /** Le titre quand il mène quelque part ; il prend la place de `nom`. */
  readonly lien?: ReactNode;
  /** Rôle, mention, « Espace courant » : dits par un texte, jamais par la seule couleur. */
  readonly details?: string | undefined;
  readonly commandes: ReactNode;
}

/**
 * Liste d'espaces (F-032-AC1, AC29, AC30) : ce qui la précède (annonce, alerte, texte d'une liste
 * vide), puis une rangée par espace, son titre sur une ligne, ses détails, ses commandes. Le focus
 * revient au groupe quand la commande d'origine a disparu avec sa rangée.
 */
export function ListeDEspaces(props: {
  readonly refGroupe?: Ref<HTMLDivElement> | undefined;
  readonly rangees: readonly RangeeDEspace[];
  readonly children?: ReactNode;
}): ReactElement {
  return (
    <div ref={props.refGroupe} tabIndex={-1} className={ESPACES.groupe}>
      {props.children}
      {props.rangees.length > 0 && (
        <ul className={ESPACES.liste}>
          {props.rangees.map((rangee) => (
            <li key={rangee.cle} className={ESPACES.rangee}>
              {rangee.lien ?? <p className={ESPACES.titreDeRangee}>{rangee.nom}</p>}
              {rangee.details !== undefined && (
                <p className={ESPACES.detailDeRangee}>{rangee.details}</p>
              )}
              <Actions>{rangee.commandes}</Actions>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
