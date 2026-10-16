import {
  type CSSProperties,
  type FocusEvent,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
  type Ref,
  useId,
  useState,
} from "react";

import { BoutonIcone } from "./BoutonIcone.tsx";
import { Pictogramme } from "./Pictogramme.tsx";
import { RANGEE } from "./rangee.classes.ts";

/**
 * Le lien de sélection d'une rangée se désigne lui-même : ce qui doit le reconnaître dans la barre
 * (le tiroir, qui se ferme quand une page est choisie) lit ce sélecteur, pas le balisage.
 */
export const SELECTEUR_DU_LIEN_DE_PAGE = "[data-lien-de-page]";

/** Commande de repli : son nom ne change pas, l'état est porté par `aria-expanded`. */
export interface RepliDeRangee {
  readonly nom: string;
  readonly deplie: boolean;
  readonly surBascule: () => void;
}

/** Un bouton d'action de rangée : sans libellé visible, nommé pour les technologies d'assistance. */
export interface BoutonDeRangee {
  readonly nom: string;
  readonly surActivation: () => void;
  /** Raison d'une action momentanément impossible : le bouton est désactivé (F-013-AC25). */
  readonly raison?: string | undefined;
}

export interface ProprietesRangee {
  /** Profondeur de la page dans l'arbre, 1 à la racine. */
  readonly niveau: number;
  /** Titre à afficher : il est aussi le nom accessible du lien. */
  readonly titre: string;
  readonly adresse: string;
  readonly courante: boolean;
  /** Description accessible du lien : son niveau et sa page mère ; absente à la racine. */
  readonly description?: string | undefined;
  /** Absent pour une page sans sous-page. */
  readonly repli?: RepliDeRangee | undefined;
  readonly ajout: BoutonDeRangee;
  readonly actions: BoutonDeRangee;
  readonly menuOuvert: boolean;
  /** Saisie du titre, affichée à la place du lien. */
  readonly saisie?: ReactNode | undefined;
  /** Menu de la rangée, quand il est ouvert. */
  readonly menu?: ReactNode | undefined;
  readonly refLien?: Ref<HTMLAnchorElement> | undefined;
  /** Bouton « ⋯ » : le focus lui revient à la fermeture du menu. */
  readonly refActions?: Ref<HTMLButtonElement> | undefined;
  readonly surDoubleClic?: (() => void) | undefined;
  /** Frappe dans la rangée, quel que soit celui de ses éléments qui a le focus. */
  readonly surTouche?: ((evenement: KeyboardEvent<HTMLElement>) => void) | undefined;
}

function CommandeDeRepli({ repli }: { readonly repli: RepliDeRangee | undefined }): ReactElement {
  if (repli === undefined) {
    return <span className={RANGEE.sansRepli} aria-hidden="true" />;
  }
  return (
    <button
      type="button"
      className={RANGEE.repli}
      aria-label={repli.nom}
      aria-expanded={repli.deplie}
      onClick={repli.surBascule}
    >
      <span className={repli.deplie ? RANGEE.chevronDeplie : RANGEE.chevronReplie}>
        <Pictogramme nom="chevron" />
      </span>
    </button>
  );
}

function ActionsDeRangee(
  props: Pick<ProprietesRangee, "ajout" | "actions" | "menuOuvert" | "refActions">,
): ReactElement {
  const idRaison = useId();
  const { raison } = props.ajout;
  return (
    <span className={RANGEE.actions}>
      <BoutonIcone
        nom={props.ajout.nom}
        pictogramme="plus"
        lieu="rangee"
        disabled={raison !== undefined}
        aria-describedby={raison === undefined ? undefined : idRaison}
        onClick={props.ajout.surActivation}
      />
      {raison !== undefined && (
        <span id={idRaison} hidden>
          {raison}
        </span>
      )}
      <BoutonIcone
        ref={props.refActions}
        nom={props.actions.nom}
        pictogramme="points"
        lieu="rangee"
        aria-haspopup="menu"
        aria-expanded={props.menuOuvert}
        onClick={props.actions.surActivation}
      />
    </span>
  );
}

const AU_REPOS = { survol: false, focus: false };

type ProprietesLien = Pick<
  ProprietesRangee,
  "titre" | "adresse" | "courante" | "description" | "refLien" | "surDoubleClic"
>;

const SANS_FOCUS = (avant: typeof AU_REPOS): typeof AU_REPOS => ({ ...avant, focus: false });

/**
 * L'infobulle montrée au focus reste tant que le focus ne quitte pas la rangée. Placée sous le lien,
 * elle agrandit la zone défilante de la barre : retirée au moment où le pointeur presse un bouton
 * de la même rangée, elle ferait remonter la liste entre l'appui et le relâchement, et le clic
 * tomberait à côté (mesuré dans Chromium au bas d'une liste qui défile).
 */
function garderJusquALaSortie(evenement: FocusEvent<HTMLElement>, retirer: () => void): void {
  const rangee = evenement.currentTarget.closest("li");
  const vers = evenement.relatedTarget;
  if (rangee === null || !(vers instanceof Node) || !rangee.contains(vers)) {
    retirer();
    return;
  }
  const quitter = (sortie: globalThis.FocusEvent): void => {
    const suivant = sortie.relatedTarget;
    if (!(suivant instanceof Node) || !rangee.contains(suivant)) {
      rangee.removeEventListener("focusout", quitter);
      retirer();
    }
  };
  rangee.addEventListener("focusout", quitter);
}

// Le titre tient sur une ligne. Coupé, il s'affiche en entier dans une infobulle au survol et au
// focus ; elle reste hors de l'arbre d'accessibilité, le nom du lien étant déjà le titre complet.
function LienDeRangee(props: ProprietesLien): ReactElement {
  const { titre, description } = props;
  const idDescription = useId();
  const [coupe, setCoupe] = useState(AU_REPOS);
  const mesurer = (lien: HTMLElement, cause: keyof typeof AU_REPOS): void =>
    setCoupe((avant) => ({ ...avant, [cause]: lien.scrollWidth > lien.clientWidth }));
  return (
    <>
      <a
        ref={props.refLien}
        className={RANGEE.lien}
        href={props.adresse}
        data-lien-de-page=""
        aria-current={props.courante ? "page" : undefined}
        aria-describedby={description === undefined ? undefined : idDescription}
        onMouseEnter={(evenement) => mesurer(evenement.currentTarget, "survol")}
        onMouseLeave={() => setCoupe((avant) => ({ ...avant, survol: false }))}
        onFocus={(evenement) => mesurer(evenement.currentTarget, "focus")}
        onBlur={(evenement) => garderJusquALaSortie(evenement, () => setCoupe(SANS_FOCUS))}
        onDoubleClick={props.surDoubleClic}
      >
        {titre}
      </a>
      {description !== undefined && (
        <span id={idDescription} hidden>
          {description}
        </span>
      )}
      {(coupe.survol || coupe.focus) && (
        <span className={RANGEE.infobulle} data-infobulle="titre" aria-hidden="true">
          {titre}
        </span>
      )}
    </>
  );
}

// La liste est plate (F-002) : la rangée ne rend pas ses sous-pages, le retrait vient du niveau.
export function Rangee(props: ProprietesRangee): ReactElement {
  const { niveau, courante, menuOuvert } = props;
  return (
    <li
      className={niveau > 1 ? RANGEE.sousPage : RANGEE.element}
      aria-level={niveau}
      style={{ "--niveau": niveau } as CSSProperties}
    >
      <div
        className={courante ? RANGEE.courante : RANGEE.repos}
        data-menu-ouvert={menuOuvert ? "" : undefined}
        onKeyDown={props.surTouche}
      >
        {courante && <span className={RANGEE.repere} aria-hidden="true" />}
        <CommandeDeRepli repli={props.repli} />
        {props.saisie ?? <LienDeRangee {...props} />}
        <ActionsDeRangee
          ajout={props.ajout}
          actions={props.actions}
          menuOuvert={menuOuvert}
          refActions={props.refActions}
        />
        {props.menu}
      </div>
    </li>
  );
}
