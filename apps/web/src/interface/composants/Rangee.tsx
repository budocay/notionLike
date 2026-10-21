import {
  type CSSProperties,
  type DOMAttributes,
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

/**
 * Ce que le glisser-déposer pose sur la rangée (F-006) : la rangée est saisie au pointeur partout,
 * au clavier par son lien seul ; elle suit le geste par `transform` seul et porte le repère de dépôt
 * quand elle est la cible survolée.
 */
export interface GlisserDeRangee {
  readonly ref: (element: HTMLElement | null) => void;
  readonly ecouteursDuPointeur: Pick<DOMAttributes<HTMLElement>, "onPointerDown">;
  readonly ecouteursDuClavier: Pick<DOMAttributes<HTMLElement>, "onKeyDown">;
  /** Instructions du geste au clavier, jointes à la description du lien. */
  readonly idDesInstructions: string;
  readonly deplacement: string | undefined;
  readonly enGlissement: boolean;
  readonly zone: "avant" | "apres" | "dans" | undefined;
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
  /** Absent : la rangée ne se glisse pas. */
  readonly glisser?: GlisserDeRangee | undefined;
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
  "titre" | "adresse" | "courante" | "description" | "refLien" | "surDoubleClic" | "glisser"
>;

/** Identifiants des descriptions du lien : sa place dans l'arbre, puis les instructions du geste. */
function descriptionsDuLien(
  idDescription: string | undefined,
  glisser: GlisserDeRangee | undefined,
): string | undefined {
  const ids = [idDescription, glisser?.idDesInstructions].filter((id) => id !== undefined);
  return ids.length === 0 ? undefined : ids.join(" ");
}

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
  const { titre, description, glisser } = props;
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
        aria-describedby={descriptionsDuLien(
          description === undefined ? undefined : idDescription,
          glisser,
        )}
        // Le navigateur ne lance pas son propre glisser du lien : le geste est celui de la rangée.
        draggable={false}
        onKeyDown={glisser?.ecouteursDuClavier.onKeyDown}
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

const CLASSE_DE_L_ELEMENT = {
  racine: { repos: RANGEE.element, glissee: RANGEE.elementGlisse },
  sousPage: { repos: RANGEE.sousPage, glissee: RANGEE.sousPageGlissee },
} as const;

function classesDeLElement(niveau: number, glisser: GlisserDeRangee | undefined): string {
  const classes = CLASSE_DE_L_ELEMENT[niveau > 1 ? "sousPage" : "racine"];
  return glisser?.enGlissement === true ? classes.glissee : classes.repos;
}

const REPERE_DE_DEPOT = {
  avant: RANGEE.depotAvant,
  apres: RANGEE.depotApres,
  dans: RANGEE.depotDans,
} as const;

// Le repère de dépôt est un trait au-dessus ou au-dessous de la rangée, ou un contour en tirets
// autour d'elle : une forme, pas la couleur seule (F-006-AC28). Il est hors de l'arbre d'accessibilité,
// les annonces du geste le disent.
function RepereDeDepot({ glisser }: { readonly glisser: GlisserDeRangee | undefined }) {
  const zone = glisser?.zone;
  return zone === undefined ? null : (
    <span className={REPERE_DE_DEPOT[zone]} data-repere-de-depot={zone} aria-hidden="true" />
  );
}

// La liste est plate (F-002) : la rangée ne rend pas ses sous-pages, le retrait vient du niveau.
export function Rangee(props: ProprietesRangee): ReactElement {
  const { niveau, courante, menuOuvert, glisser } = props;
  const classes = classesDeLElement(niveau, glisser);
  // Le geste ne pose que `transform` : aucune transition, aucune durée (F-006-AC29).
  const style = { "--niveau": niveau, transform: glisser?.deplacement } as CSSProperties;
  return (
    <li
      ref={glisser?.ref}
      className={classes}
      aria-level={niveau}
      style={style}
      onPointerDown={glisser?.ecouteursDuPointeur.onPointerDown}
    >
      <div
        className={courante ? RANGEE.courante : RANGEE.repos}
        data-menu-ouvert={menuOuvert ? "" : undefined}
        onKeyDown={props.surTouche}
      >
        {courante && <span className={RANGEE.repere} aria-hidden="true" />}
        <RepereDeDepot glisser={glisser} />
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
