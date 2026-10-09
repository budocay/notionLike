import type { ReactElement, ReactNode } from "react";

import { BoutonIcone } from "./Bouton.tsx";
import { HAUT } from "./haut.classes.ts";

export interface Ancetre {
  readonly titre: string;
  readonly adresse: string;
}

/** Commande derrière laquelle passent les ancêtres intermédiaires. */
export interface RepliDuFil {
  readonly nom: string;
  readonly surOuverture: () => void;
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

export function FilAriane({ nom, ancetres, courante, repli }: ProprietesFil): ReactElement {
  const replies = repli !== undefined && ancetres.length > 1;
  const visibles = replies ? ancetres.slice(0, 1) : ancetres;
  return (
    <nav className={HAUT.fil} aria-label={nom}>
      <ol className={HAUT.liste}>
        {visibles.map((ancetre) => (
          <LienAncetre key={ancetre.adresse} ancetre={ancetre} />
        ))}
        {replies && (
          <li className={HAUT.elementFixe}>
            <BoutonIcone
              nom={repli.nom}
              pictogramme="points"
              lieu="barre"
              onClick={repli.surOuverture}
            />
            <Separateur />
          </li>
        )}
        <li className={HAUT.element}>
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
