// État de la vue « Tableau » (F-018-AC18 à AC47) : fenêtre, cellule courante, mode édition, menu,
// boîte ouverte, annonce et alerte. Les composants de la vue le reçoivent tel quel ; la table lue
// et les lignes affichées viennent de l'écran de table à chaque rendu.
import type {
  ColonneLue,
  DocumentTable,
  IdColonne,
  LigneLue,
  TableLue,
} from "@notionlike/document";
import {
  type ReactNode,
  type RefObject,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import type { Moyens } from "./actions.ts";
import type { Boite, Suite } from "./grille.ts";
import { type MenuDeGrille, useMenuDeGrille } from "./menu-de-grille.ts";
import { deplacer, type Position } from "./navigation-grille.ts";
import { CELLULE_SUPPRIMEE } from "./textes.ts";
import { type CouranteDeLaGrille, useCourante } from "./use-courante.ts";
import { type EditionDeLaGrille, useEdition } from "./use-edition.ts";
import { type FenetreDeLaGrille, useFenetre } from "./use-fenetre.ts";

export interface ProprietesVueTableau {
  readonly table: DocumentTable;
  readonly lue: TableLue;
  /** Les lignes affichées, calculées par `lignesAffichees` (AC45). */
  readonly lignes: readonly LigneLue[];
  readonly titre: string;
  readonly lectureSeule?: string | undefined;
  readonly largeurDe: (colonne: IdColonne) => number;
  /** Règle la largeur d'une colonne (AC43) ; `enregistrer` faux pendant un glissement. */
  readonly reglerLargeur: (colonne: IdColonne, largeur: number, enregistrer: boolean) => void;
  /** Sélecteur de vues, rendu dans la barre d'outils quand la liste des vues en compte deux (AC44). */
  readonly selecteur?: ReactNode | undefined;
}

export interface VueTableau {
  readonly proprietes: ProprietesVueTableau;
  readonly colonnes: readonly ColonneLue[];
  readonly fenetre: FenetreDeLaGrille;
  readonly courante: CouranteDeLaGrille;
  readonly edition: EditionDeLaGrille;
  readonly menu: MenuDeGrille;
  readonly boite: Boite | undefined;
  readonly ouvrirBoite: (boite: Boite) => void;
  /** Ferme la boîte ; `rendre` : le focus revient à la commande d'origine (AC21). */
  readonly fermerBoite: (rendre: boolean) => void;
  readonly annonce: string;
  readonly alerte: string | undefined;
  readonly idAlerte: string;
  readonly cadre: RefObject<HTMLDivElement | null>;
  readonly invitation: RefObject<HTMLButtonElement | null>;
  readonly moyens: Moyens;
}

// L'origine d'une boîte est l'élément qui a le focus, ou la cellule qui a ouvert le menu quand la
// boîte est ouverte depuis l'une de ses entrées, qui disparaît avec lui (AC21).
function useBoiteOuverte(menu: MenuDeGrille) {
  const [boite, setBoite] = useState<Boite | undefined>(undefined);
  const origine = useRef<HTMLElement | null>(null);
  const aRendre = useRef(false);
  useEffect(() => {
    if (boite === undefined && aRendre.current) {
      aRendre.current = false;
      origine.current?.focus();
    }
  });
  return {
    boite,
    ouvrirBoite: (suivante: Boite) => {
      const actif = document.activeElement;
      const depuisLeMenu = actif?.closest('[role="menu"]') !== null && actif !== null;
      origine.current = depuisLeMenu
        ? menu.origine.current
        : actif instanceof HTMLElement
          ? actif
          : null;
      setBoite(suivante);
    },
    fermerBoite: (rendre: boolean) => {
      aRendre.current = rendre;
      setBoite(undefined);
    },
  };
}

// Mode édition dont la ligne ou la colonne a disparu de la table lue : il est quitté sans rien
// écrire, et l'écran le dit (AC36).
function useEditionOrpheline(
  vue: Pick<VueTableau, "edition" | "colonnes">,
  lignes: readonly LigneLue[],
  signaler: (message: string) => void,
): void {
  const ouverte = vue.edition.edition;
  const orpheline =
    ouverte !== undefined &&
    (!vue.colonnes.some(({ id }) => id === ouverte.colonne) ||
      (ouverte.sorte !== "nom" && !lignes.some(({ id }) => id === ouverte.ligne)));
  useEffect(() => {
    if (orpheline) {
      vue.edition.abandonner();
      signaler(CELLULE_SUPPRIMEE);
    }
  });
}

export function useVueTableau(proprietes: ProprietesVueTableau): VueTableau {
  const { table, lue, lignes, lectureSeule } = proprietes;
  const colonnes = lue.colonnes;
  const [annonce, setAnnonce] = useState("");
  const [alerte, setAlerte] = useState<string | undefined>(undefined);
  const cadre = useRef<HTMLDivElement>(null);
  const invitation = useRef<HTMLButtonElement>(null);
  const versLInvitation = useRef(false);
  useLayoutEffect(() => {
    if (versLInvitation.current && invitation.current !== null) {
      versLInvitation.current = false;
      invitation.current.focus();
    }
  });
  const fenetre = useFenetre(lignes.length);
  const courante = useCourante({ lignes, colonnes, grille: cadre, amener: fenetre.amener });
  const apres = (suite: Suite): void =>
    apresLaValidation(courante, fenetre, { lignes, colonnes }, suite);
  const edition = useEdition({ table, lignes, colonnes, lectureSeule, apres });
  const menu = useMenuDeGrille();
  const boites = useBoiteOuverte(menu);
  const moyens: Moyens = {
    table,
    lue,
    lignes,
    lectureSeule,
    allerVers: courante.allerVers,
    annoncer: setAnnonce,
    signaler: setAlerte,
    focaliserLInvitation: () => {
      versLInvitation.current = true;
    },
  };
  useEditionOrpheline({ edition, colonnes }, lignes, setAlerte);
  return {
    proprietes,
    colonnes,
    fenetre,
    courante,
    edition,
    menu,
    ...boites,
    annonce,
    alerte: edition.edition?.sorte === "choix" ? alerte : (edition.edition?.erreur ?? alerte),
    idAlerte: useId(),
    cadre,
    invitation,
    moyens,
  };
}

// Après une validation, Entrée descend d'une ligne, Tab et Maj+Tab passent à la cellule suivante ou
// précédente de la ligne, sans sortir de la grille (AC33) ; la cellule reprend le focus.
function apresLaValidation(
  courante: CouranteDeLaGrille,
  fenetre: FenetreDeLaGrille,
  {
    lignes,
    colonnes,
  }: { readonly lignes: readonly LigneLue[]; readonly colonnes: readonly ColonneLue[] },
  suite: Suite,
): void {
  const dimensions = { lignes: lignes.length, colonnes: colonnes.length, parPage: fenetre.parPage };
  if (suite === "sortie") {
    return;
  }
  const deplacements = {
    rester: undefined,
    descendre: "bas",
    suivante: "droite",
    precedente: "gauche",
  } as const;
  const deplacement = deplacements[suite];
  const vers: Position =
    deplacement === undefined ? courante.place : deplacer(courante.place, deplacement, dimensions);
  courante.allerA(vers.colonne === 0 ? courante.place : vers);
}
