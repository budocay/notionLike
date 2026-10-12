import { type ReactElement, type ReactNode, type Ref, useId } from "react";

import { BoutonIcone } from "./BoutonIcone.tsx";
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

interface ProprietesChemin {
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

/** Chemin de la page dans l'arbre : ses ancêtres, chacun un lien, puis elle, non activable. */
export function CheminDePage({ nom, ancetres, courante, repli }: ProprietesChemin): ReactElement {
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

interface ProprietesZoneEtat {
  /** Texte d'échec : il l'emporte sur l'affirmation. */
  readonly echec: string | undefined;
  /** Texte affirmatif, que l'appelant ne donne qu'une fois l'enregistrement prouvé (F-030-AC29). */
  readonly affirmation?: string | undefined;
  /**
   * Phrase lue par les technologies d'assistance avec l'affirmation, sans être affichée ; une
   * espace l'en sépare, dans la même zone : une seule annonce (F-030-AC14).
   */
  readonly annonce?: string | undefined;
}

/**
 * Zone d'état de l'enregistrement local, annoncée quand son texte change : l'échec, l'affirmation,
 * ou rien (F-004-AC40). Chaque texte a son repère non textuel.
 */
export function ZoneEtat({ echec, affirmation, annonce }: ProprietesZoneEtat): ReactElement {
  if (echec !== undefined) {
    return (
      <div className={HAUT.etat} role="status">
        <span className={HAUT.pastille} aria-hidden="true" />
        {echec}
      </div>
    );
  }
  return (
    <div className={affirmation === undefined ? HAUT.etat : HAUT.etatAffirme} role="status">
      {affirmation !== undefined && (
        <>
          <span className={HAUT.pastilleAffirmee} aria-hidden="true" />
          {affirmation}
          {annonce !== undefined && <span className={HAUT.annonce}> {annonce}</span>}
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
