// Composants de présentation du compte (F-010) : la zone de la barre latérale et le
// formulaire d'un écran de compte. Ils ne savent rien du serveur : textes et états leur sont donnés.
import {
  type ComponentProps,
  type FormEvent,
  type ReactElement,
  type ReactNode,
  type Ref,
  useId,
} from "react";

import { COMPTE } from "./compte.classes.ts";

interface ProprietesCadre {
  /** Nom accessible de la zone. */
  readonly nom: string;
  /** État du compte, une phrase par élément, annoncé sans déplacer le focus. */
  readonly phrases: readonly string[];
  readonly children?: ReactNode | undefined;
}

export function CadreDeCompte({ nom, phrases, children }: ProprietesCadre): ReactElement {
  return (
    <section aria-label={nom} className={COMPTE.zone}>
      <div role="status" className={COMPTE.etat}>
        {phrases.map((phrase) => (
          <p key={phrase}>{phrase}</p>
        ))}
      </div>
      {children !== undefined && <div className={COMPTE.actions}>{children}</div>}
    </section>
  );
}

interface ProprietesAction {
  readonly libelle: string;
  /** Avec une adresse, l'action est un lien ; sans, un bouton. */
  readonly adresse?: string | undefined;
  readonly surActivation?: (() => void) | undefined;
  readonly desactivee?: boolean | undefined;
  /** Vrai : l'action mène à l'écran affiché, marquée courante (F-007-AC1). */
  readonly courante?: boolean | undefined;
  /**
   * Nom accessible, quand il dit plus que le libellé (F-032-AC4) ; il contient le libellé visible
   * sans forcément commencer par lui : celui du sélecteur d'espace est « Espaces — espace courant :
   * <nom> » pour le libellé « <nom> ».
   */
  readonly nom?: string | undefined;
  /** Vrai : le libellé tient sur une ligne, coupé par des points de suspension (F-004-AC24). */
  readonly coupe?: boolean | undefined;
  /** Le lien, pour y porter le focus (F-032-AC29). */
  readonly refLien?: Ref<HTMLAnchorElement> | undefined;
}

export function ActionDeCompte(props: ProprietesAction): ReactElement {
  const libelle =
    props.coupe === true ? (
      <span className={COMPTE.libelleCoupe}>{props.libelle}</span>
    ) : (
      props.libelle
    );
  return props.adresse === undefined ? (
    <button
      type="button"
      className={props.courante === true ? COMPTE.actionCourante : COMPTE.action}
      aria-current={props.courante === true ? "page" : undefined}
      aria-label={props.nom}
      disabled={props.desactivee}
      onClick={props.surActivation}
    >
      {libelle}
    </button>
  ) : (
    <a
      ref={props.refLien}
      href={props.adresse}
      className={props.courante === true ? COMPTE.actionCourante : COMPTE.action}
      aria-current={props.courante === true ? "page" : undefined}
      aria-label={props.nom}
    >
      {libelle}
    </a>
  );
}

interface ProprietesChamp extends Omit<ComponentProps<"input">, "id" | "className" | "ref"> {
  readonly etiquette: string;
  /** Marque visible d'un champ obligatoire. */
  readonly marque: string;
  /** Message du refus, relié au champ ; absent, le champ est valide. */
  readonly faute: string | undefined;
  readonly refChamp?: Ref<HTMLInputElement> | undefined;
}

export function ChampDeCompte(props: ProprietesChamp): ReactElement {
  const { etiquette, marque, faute, refChamp, ...natives } = props;
  const id = useId();
  const idFaute = useId();
  return (
    <div className={COMPTE.champ}>
      <label htmlFor={id} className={COMPTE.etiquette}>
        {etiquette} <span className={COMPTE.marque}>{marque}</span>
      </label>
      <input
        id={id}
        ref={refChamp}
        className={COMPTE.saisie}
        aria-invalid={faute !== undefined}
        aria-describedby={faute === undefined ? undefined : idFaute}
        {...natives}
      />
      {faute !== undefined && (
        <span id={idFaute} className={COMPTE.faute}>
          {faute}
        </span>
      )}
    </div>
  );
}

interface ProprietesFormulaire {
  readonly titre: string;
  readonly introduction?: string | undefined;
  readonly envoi: string;
  /** Vrai pendant l'envoi : bouton désactivé, formulaire occupé. */
  readonly enCours: boolean;
  /** Envoi désactivé hors de l'attente, pendant un délai imposé. */
  readonly bloque: boolean;
  /** Texte de l'attente, annoncé ; vide hors de l'attente. */
  readonly attente: string;
  /** Échec du dernier envoi, annoncé sans déplacer le focus. */
  readonly alerte?: ReactNode | undefined;
  readonly surEnvoi: (evenement: FormEvent<HTMLFormElement>) => void;
  /** Champs. */
  readonly children: ReactNode;
  /** Liens vers l'autre écran et vers l'application. */
  readonly pied: ReactNode;
}

export function FormulaireDeCompte(props: ProprietesFormulaire): ReactElement {
  const idTitre = useId();
  return (
    <div className={COMPTE.enveloppe}>
      <form
        noValidate
        aria-labelledby={idTitre}
        aria-busy={props.enCours}
        className={COMPTE.formulaire}
        onSubmit={props.surEnvoi}
      >
        <h1 id={idTitre} className={COMPTE.titre}>
          {props.titre}
        </h1>
        {props.introduction !== undefined && <p className={COMPTE.texte}>{props.introduction}</p>}
        {props.children}
        <button type="submit" className={COMPTE.envoi} disabled={props.enCours || props.bloque}>
          {props.envoi}
        </button>
        <p role="status" className={COMPTE.attente}>
          {props.attente}
        </p>
        <div role="alert" className={COMPTE.alerte}>
          {props.alerte}
        </div>
        <div className={COMPTE.actions}>{props.pied}</div>
      </form>
    </div>
  );
}
