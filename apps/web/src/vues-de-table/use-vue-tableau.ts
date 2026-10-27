// État de la vue « Tableau » (F-018-AC18 à AC47) : fenêtre, cellule courante, mode édition, menu,
// boîte ouverte, annonce et alerte. Les composants de la vue le reçoivent tel quel ; la table lue
// et les lignes affichées viennent de l'écran de table à chaque rendu.
import type {
  ColonneLue,
  DocumentTable,
  IdColonne,
  IdLigne,
  LigneLue,
  TableLue,
} from "@notionlike/document";
import {
  type ReactNode,
  type RefObject,
  useEffect,
  useEffectEvent,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import type { Moyens } from "./actions.ts";
import type { Boite, Suite } from "./grille.ts";
import { cleDeCellule } from "./courante.ts";
import { DEFINITION_VIDE, type Definition } from "./definition.ts";
import { SANS_SURVEILLANCE, type Surveillance } from "./ecritures.ts";
import { type MenuDeGrille, useMenuDeGrille } from "./menu-de-grille.ts";
import { deplacer, type Position } from "./navigation-grille.ts";
import { CELLULE_SUPPRIMEE } from "./textes.ts";
import type { TriDeColonne } from "./tris.ts";
import { type CouranteDeLaGrille, useCourante } from "./use-courante.ts";
import { type EditionDeLaGrille, useEdition } from "./use-edition.ts";
import { type FenetreDeLaGrille, useFenetre } from "./use-fenetre.ts";

/** Ce que l'écran de table donne à une vue de la définition et de l'affichage figé (F-019). */
export interface DefinitionDeLaVue {
  readonly definition: Definition;
  readonly changer: (definition: Definition) => void;
  /** Nombre de lignes de la table lue, pour le compte « N lignes sur M » (AC6). */
  readonly total: number;
  readonly fige: boolean;
  readonly reappliquer: () => void;
  readonly horsFiltre: ReadonlySet<IdLigne>;
  /** Un tri a un effet : l'ordre manuel ne se modifie pas depuis la vue (AC19). */
  readonly triActif: boolean;
  /** Sens du tri d'une colonne et son rang parmi les tris actifs (1 : le principal, AC12). */
  readonly triDe: (colonne: IdColonne) => TriDeColonne | undefined;
  /** Signale au calcul des lignes affichées les écritures de l'onglet (cellule, ligne créée ou déplacée, AC17). */
  readonly surveillance: Surveillance;
}

const SANS_DEFINITION: DefinitionDeLaVue = {
  definition: DEFINITION_VIDE,
  changer: () => undefined,
  total: 0,
  fige: false,
  reappliquer: () => undefined,
  horsFiltre: new Set(),
  triActif: false,
  triDe: () => undefined,
  surveillance: SANS_SURVEILLANCE,
};

export interface ProprietesVueTableau {
  readonly table: DocumentTable;
  readonly lue: TableLue;
  /** Les lignes affichées, calculées par `lignesAffichees` (AC45). */
  readonly lignes: readonly LigneLue[];
  readonly titre: string;
  readonly lectureSeule?: string | undefined;
  /**
   * Filtres et tris de la table, communs à ses vues (F-019-AC15). Absents, la vue n'affiche ni barres
   * ni marques : la définition est vide.
   */
  readonly definition?: DefinitionDeLaVue | undefined;
  readonly largeurDe: (colonne: IdColonne) => number;
  /** Règle la largeur d'une colonne (AC43) ; `enregistrer` faux pendant un glissement. */
  readonly reglerLargeur: (colonne: IdColonne, largeur: number, enregistrer: boolean) => void;
  /** Sélecteur de vues, rendu dans la barre d'outils quand la liste des vues en compte deux (AC44). */
  readonly selecteur?: ReactNode | undefined;
}

export interface VueTableau {
  readonly proprietes: ProprietesVueTableau;
  /** La définition de la vue, vide quand l'écran n'en donne pas. */
  readonly definition: DefinitionDeLaVue;
  readonly colonnes: readonly ColonneLue[];
  readonly fenetre: FenetreDeLaGrille;
  readonly courante: CouranteDeLaGrille;
  /** Séparateurs de largeur rendus, par colonne : le menu d'un en-tête y porte le focus (AC43). */
  readonly separateurs: Map<IdColonne, HTMLElement>;
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

/** Délai entre le vidage de la zone d'annonce et sa réécriture, pour qu'un texte identique soit relu. */
const RELECTURE_D_ANNONCE_MS = 150;

// La zone d'annonce (`role="status"`) ne relit pas un texte inchangé : une annonce identique à la
// précédente (deux « Déjà la première ligne. » de suite) la vide, puis la réécrit un instant après.
function useAnnonce(): readonly [string, (texte: string) => void] {
  const [annonce, setAnnonce] = useState("");
  const derniere = useRef("");
  const differee = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(differee.current), []);
  const annoncer = (texte: string): void => {
    window.clearTimeout(differee.current);
    if (texte !== derniere.current) {
      derniere.current = texte;
      setAnnonce(texte);
      return;
    }
    setAnnonce("");
    differee.current = window.setTimeout(() => setAnnonce(texte), RELECTURE_D_ANNONCE_MS);
  };
  return [annonce, annoncer];
}

function focusSurLeCorps(): boolean {
  const actif = document.activeElement;
  return actif === null || actif === document.body;
}

// Le focus passe à l'invitation « Ajouter une colonne » quand la suppression locale de la dernière
// colonne le demande, ou quand une mise à jour reçue retire la dernière colonne : la grille et sa
// barre d'outils sont démontées et le focus qui y était retombe sur `body` (AC35). Un focus resté
// ailleurs dans l'application n'est pas déplacé.
function useFocusDeLInvitation(nombreDeColonnes: number) {
  const invitation = useRef<HTMLButtonElement>(null);
  const versLInvitation = useRef(false);
  const avaitDesColonnes = useRef(nombreDeColonnes > 0);
  useLayoutEffect(() => {
    const perdu = avaitDesColonnes.current && nombreDeColonnes === 0 && focusSurLeCorps();
    avaitDesColonnes.current = nombreDeColonnes > 0;
    if ((versLInvitation.current || perdu) && invitation.current !== null) {
      versLInvitation.current = false;
      invitation.current.focus();
    }
  });
  return { invitation, versLInvitation };
}

// L'origine d'une boîte est l'élément qui a le focus, ou la cellule qui a ouvert le menu quand la
// boîte est ouverte depuis l'une de ses entrées, qui disparaît avec lui (AC21). Ouverte depuis le
// menu d'une colonne, la boîte rend donc le focus à la cellule d'en-tête, pas au bouton « Actions de
// la colonne … » : ce bouton est hors de l'ordre de tabulation (tabindex itinérant, AC33), et la
// cellule est le seul arrêt de la grille d'où le clavier repart. C'est la « commande d'origine » de
// la spec, lue à travers le tabindex itinérant : un écart à la lettre d'AC21, à tenir dans l'addendum
// « Écarts au code » de docs/decisions/0019-ecran-de-table-et-reglages-de-vue.md.
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

// Menu et liste de choix sont posés sur la cellule qui les ouvre, à sa place au moment de
// l'ouverture (F-018-AC20, AC31) : la grille défilée, ils resteraient loin d'elle. Ils se ferment
// donc, sans rien écrire, et le focus revient à la cellule sans la ramener dans la vue. Seul un
// déplacement compte : un défilement déjà appliqué à l'ouverture (cellule amenée) ne ferme rien.
function useFermetureAuDefilement(
  zone: RefObject<HTMLDivElement | null>,
  menu: MenuDeGrille,
  edition: EditionDeLaGrille,
  courante: CouranteDeLaGrille,
): void {
  const choix = edition.edition?.sorte === "choix" ? edition.edition : undefined;
  const ouverte = menu.ouvert !== undefined || choix !== undefined;
  const fermer = useEffectEvent(() => {
    const origine =
      choix === undefined
        ? menu.origine.current
        : courante.elementDe(cleDeCellule(choix.ligne, choix.colonne));
    origine?.focus({ preventScroll: true });
    menu.fermer();
    if (choix !== undefined) {
      edition.abandonner();
    }
  });
  useEffect(() => {
    const element = zone.current;
    if (!ouverte || element === null) {
      return undefined;
    }
    const { scrollTop, scrollLeft } = element;
    const surDefilement = (): void => {
      if (element.scrollTop !== scrollTop || element.scrollLeft !== scrollLeft) {
        fermer();
      }
    };
    element.addEventListener("scroll", surDefilement);
    return () => element.removeEventListener("scroll", surDefilement);
  }, [zone, ouverte]);
}

// Annonce polie et alerte de la vue, et l'identifiant de l'alerte, que cite un champ refusé.
function useMessages() {
  const [annonce, annoncer] = useAnnonce();
  const [alerte, signaler] = useState<string | undefined>(undefined);
  const idAlerte = useId();
  return { annonce, annoncer, alerte, signaler, idAlerte };
}

// Navigation et saisie de la grille : fenêtre, cellule courante et mode édition.
function useNavigationEtSaisie(proprietes: ProprietesVueTableau) {
  const { table, lue, lignes, lectureSeule } = proprietes;
  const colonnes = lue.colonnes;
  const cadre = useRef<HTMLDivElement>(null);
  const fenetre = useFenetre(lignes.length);
  const courante = useCourante({ lignes, colonnes, grille: cadre, amener: fenetre.amener });
  const apres = (suite: Suite): void =>
    apresLaValidation(courante, fenetre, { lignes, colonnes }, suite);
  const surveillance = proprietes.definition?.surveillance ?? SANS_SURVEILLANCE;
  const edition = useEdition({ table, lignes, colonnes, lectureSeule, surveillance, apres });
  return { colonnes, cadre, fenetre, courante, edition };
}

// Ce dont les commandes ont besoin (`actions.ts`) : la table, sa lecture, où dire et focaliser.
function moyensDe(
  { table, lue, lignes, lectureSeule }: ProprietesVueTableau,
  definition: DefinitionDeLaVue,
  courante: CouranteDeLaGrille,
  messages: ReturnType<typeof useMessages>,
  versLInvitation: RefObject<boolean>,
): Moyens {
  return {
    table,
    lue,
    lignes,
    lectureSeule,
    triActif: definition.triActif,
    surveillance: definition.surveillance,
    allerVers: courante.allerVers,
    annoncer: messages.annoncer,
    signaler: messages.signaler,
    focaliserLInvitation: () => {
      versLInvitation.current = true;
    },
  };
}

// Le refus d'une saisie ouverte passe avant la dernière alerte ; une liste de choix n'en a pas.
function alerteAffichee(edition: EditionDeLaGrille, alerte: string | undefined) {
  const ouverte = edition.edition;
  return ouverte?.sorte === "choix" ? alerte : (ouverte?.erreur ?? alerte);
}

export function useVueTableau(proprietes: ProprietesVueTableau): VueTableau {
  const messages = useMessages();
  const { invitation, versLInvitation } = useFocusDeLInvitation(proprietes.lue.colonnes.length);
  const grille = useNavigationEtSaisie(proprietes);
  const { colonnes, fenetre, courante, edition } = grille;
  const separateurs = useRef(new Map<IdColonne, HTMLElement>()).current;
  const menu = useMenuDeGrille();
  const boites = useBoiteOuverte(menu);
  useEditionOrpheline({ edition, colonnes }, proprietes.lignes, messages.signaler);
  useFermetureAuDefilement(fenetre.zone, menu, edition, courante);
  const definition = proprietes.definition ?? SANS_DEFINITION;
  return {
    proprietes,
    definition,
    ...grille,
    separateurs,
    menu,
    ...boites,
    annonce: messages.annonce,
    alerte: alerteAffichee(edition, messages.alerte),
    idAlerte: messages.idAlerte,
    invitation,
    moyens: moyensDe(proprietes, definition, courante, messages, versLInvitation),
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
