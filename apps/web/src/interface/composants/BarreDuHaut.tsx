import { type ReactElement, type ReactNode, type Ref, useId } from "react";

import { BoutonIcone } from "./Bouton.tsx";
import { HAUT } from "./haut.classes.ts";

export interface Ancetre {
  readonly titre: string;
  readonly adresse: string;
}

/** Commande derrière laquelle passent les ancêtres intermédiaires, et la liste qu'elle ouvre. */
export interface RepliDuFil {
  readonly nom: string;
  readonly ouvert: boolean;
  readonly surBascule: () => void;
  readonly refCommande?: Ref<HTMLButtonElement> | undefined;
  readonly refListe?: Ref<HTMLUListElement> | undefined;
}

interface ProprietesFil {
  /** Nom accessible de la navigation. */
  readonly nom: string;
  /** Ancêtres de la page, de la racine à sa mère. */
  readonly ancetres: readonly Ancetre[];
  readonly courante: string;
  /** Présent quand la place manque : les ancêtres intermédiaires passent derrière cette commande. */
  readonly repli?: RepliDuFil | undefined;
}

function Separateur(): ReactElement {
  return (
    <span className={HAUT.separateur} aria-hidden="true">
      /
    </span>
  );
}

function LienAncetre({ ancetre }: { readonly ancetre: Ancetre }): ReactElement {
  return (
    <li className={HAUT.element}>
      <a className={HAUT.lien} href={ancetre.adresse}>
        {ancetre.titre}
      </a>
      <Separateur />
    </li>
  );
}

interface ProprietesIntermediaires {
  readonly id: string;
  readonly repli: RepliDuFil;
  readonly ancetres: readonly Ancetre[];
}

function Intermediaires({ id, repli, ancetres }: ProprietesIntermediaires): ReactElement {
  return (
    <li className={HAUT.elementFixe}>
      <BoutonIcone
        ref={repli.refCommande}
        nom={repli.nom}
        pictogramme="points"
        lieu="barre"
        aria-expanded={repli.ouvert}
        aria-controls={id}
        onClick={repli.surBascule}
      />
      {repli.ouvert && (
        <ul ref={repli.refListe} id={id} className={HAUT.intermediaires}>
          {ancetres.map((ancetre) => (
            <li key={ancetre.adresse}>
              <a className={HAUT.intermediaire} href={ancetre.adresse}>
                {ancetre.titre}
              </a>
            </li>
          ))}
        </ul>
      )}
      <Separateur />
    </li>
  );
}

export function FilAriane({ nom, ancetres, courante, repli }: ProprietesFil): ReactElement {
  const idListe = useId();
  const replies = repli !== undefined && ancetres.length > 1;
  const visibles = replies ? ancetres.slice(0, 1) : ancetres;
  return (
    <nav className={HAUT.fil} aria-label={nom}>
      <ol className={HAUT.liste}>
        {visibles.map((ancetre) => (
          <LienAncetre key={ancetre.adresse} ancetre={ancetre} />
        ))}
        {replies && <Intermediaires id={idListe} repli={repli} ancetres={ancetres.slice(1)} />}
        <li className={HAUT.elementCourant}>
          <span className={HAUT.courante} aria-current="page">
            {courante}
          </span>
        </li>
      </ol>
    </nav>
  );
}

/** Zone d'état de l'enregistrement local : vide tant que rien n'a échoué (F-004-AC40). */
export function ZoneEtat({ echec }: { readonly echec: string | undefined }): ReactElement {
  return (
    <div className={HAUT.etat} role="status">
      {echec !== undefined && (
        <>
          <span className={HAUT.pastille} aria-hidden="true" />
          {echec}
        </>
      )}
    </div>
  );
}

interface ProprietesBarre {
  /** Bouton d'ouverture du tiroir, sur écran étroit seulement. */
  readonly ouverture?: ReactNode | undefined;
  /** Fil d'Ariane, quand une page est sélectionnée. */
  readonly fil?: ReactNode | undefined;
  readonly etat: ReactNode;
}

export function BarreDuHaut({ ouverture, fil, etat }: ProprietesBarre): ReactElement {
  return (
    <header className={HAUT.cadre}>
      {ouverture}
      {fil ?? <span className={HAUT.fil} />}
      {etat}
    </header>
  );
}
