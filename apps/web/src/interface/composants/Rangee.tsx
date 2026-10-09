import type { CSSProperties, ReactElement, ReactNode } from "react";

import { BoutonIcone } from "./Bouton.tsx";
import { Pictogramme } from "./Pictogramme.tsx";
import { RANGEE } from "./rangee.classes.ts";

/** Commande de repli : son nom ne change pas, l'état est porté par `aria-expanded`. */
export interface Repli {
  readonly nom: string;
  readonly deplie: boolean;
  readonly surBascule: () => void;
}

/** Une action de rangée : un bouton sans libellé visible, nommé pour les technologies d'assistance. */
export interface ActionDeRangee {
  readonly nom: string;
  readonly surActivation: () => void;
}

export interface ProprietesRangee {
  /** Profondeur de la page dans l'arbre, 1 à la racine. */
  readonly niveau: number;
  /** Titre à afficher : il est aussi le nom accessible du lien. */
  readonly titre: string;
  readonly adresse: string;
  readonly courante: boolean;
  /** Absent pour une page sans sous-page. */
  readonly repli?: Repli | undefined;
  readonly ajout: ActionDeRangee;
  readonly actions: ActionDeRangee;
  readonly menuOuvert: boolean;
  /** Saisie du titre, affichée à la place du lien. */
  readonly saisie?: ReactNode | undefined;
  /** Menu de la rangée, quand il est ouvert. */
  readonly menu?: ReactNode | undefined;
}

function CommandeDeRepli({ repli }: { readonly repli: Repli | undefined }): ReactElement {
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
  props: Pick<ProprietesRangee, "ajout" | "actions" | "menuOuvert">,
): ReactElement {
  return (
    <span className={RANGEE.actions}>
      <BoutonIcone
        nom={props.ajout.nom}
        pictogramme="plus"
        lieu="rangee"
        onClick={props.ajout.surActivation}
      />
      <BoutonIcone
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

// La liste est plate (F-002) : la rangée ne rend pas ses sous-pages, le retrait vient du niveau.
export function Rangee(props: ProprietesRangee): ReactElement {
  const { niveau, titre, adresse, courante, menuOuvert } = props;
  return (
    <li
      className={RANGEE.element}
      aria-level={niveau}
      style={{ "--niveau": niveau } as CSSProperties}
    >
      <div
        className={courante ? RANGEE.courante : RANGEE.repos}
        data-menu-ouvert={menuOuvert ? "" : undefined}
      >
        {courante && <span className={RANGEE.repere} aria-hidden="true" />}
        <CommandeDeRepli repli={props.repli} />
        {props.saisie ?? (
          <a className={RANGEE.lien} href={adresse} aria-current={courante ? "page" : undefined}>
            {titre}
          </a>
        )}
        <ActionsDeRangee ajout={props.ajout} actions={props.actions} menuOuvert={menuOuvert} />
        {props.menu}
      </div>
    </li>
  );
}
