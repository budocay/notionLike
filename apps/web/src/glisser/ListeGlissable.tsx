// Le geste de glisser-déposer d'une liste (F-006-AC1, AC7, AC8, AC36, ADR-0015) : seul fichier, avec
// les autres de ce module, qui emploie la bibliothèque. Il ne porte que le geste : ni document, ni
// destination, ni texte ; ce qu'une zone admet, ce que fait le lâcher et ce qui est annoncé lui sont
// donnés par l'application.
import {
  type Announcements,
  closestCenter,
  type CollisionDetection,
  DndContext,
  type DragMoveEvent,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  type UniqueIdentifier,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { type ReactElement, type ReactNode, useEffect, useMemo, useRef, useState } from "react";

import { useZoneDePile, type ZoneDePile } from "./element.ts";
import { ContexteDuSurvol, type Survol } from "./survol.ts";
import { moitieDuPoint, type ZoneDeDepot, zoneDuPoint } from "./zone.ts";

/** Textes adressés aux technologies d'assistance, fournis par l'application, en français. */
export interface AnnoncesDuGlisser {
  readonly instructions: string;
  saisie(actif: string): string;
  survol(actif: string, cible: string | undefined, zone: ZoneDeDepot | undefined): string;
  depot(actif: string, cible: string | undefined, zone: ZoneDeDepot | undefined): string;
  abandon(actif: string): string;
}

/**
 * Touches du geste au clavier, en valeurs de la propriété `code` des événements clavier, déclarées
 * par l'application.
 */
export interface TouchesDuGlisser {
  readonly saisir: readonly string[];
  readonly deposer: readonly string[];
  readonly abandonner: readonly string[];
}

export interface ProprietesListeGlissable {
  /** Identifiants des éléments, dans l'ordre affiché. */
  readonly identifiants: readonly string[];
  /** Vrai : aucun geste ne démarre (lecture seule, saisie ouverte). */
  readonly desactivee: boolean;
  readonly zoneAdmise: (actif: string, cible: string, zone: ZoneDeDepot) => boolean;
  readonly surLacher: (actif: string, cible: string, zone: ZoneDeDepot) => void;
  readonly annonces: AnnoncesDuGlisser;
  readonly touches: TouchesDuGlisser;
  /**
   * Ce qui contient la liste. La région d'annonces et le texte d'instructions sont rendus après
   * lui, à côté : jamais dans une liste, qui n'admet que des éléments de liste.
   */
  readonly children: ReactNode;
}

// Un clic sur le lien d'une rangée reste un clic : le geste ne démarre qu'au-delà de cette distance.
const DISTANCE_D_ACTIVATION = 4;

// Au pointeur, la cible est la rangée sous le pointeur, et aucune hors des rangées ; au clavier, la
// plus proche de l'élément déplacé.
const detection: CollisionDetection = (arguments_) =>
  arguments_.pointerCoordinates === null ? closestCenter(arguments_) : pointerWithin(arguments_);

// Aucune rangée voisine ne s'écarte : seule la rangée glissée se déplace (F-006-AC29).
const SANS_ECARTEMENT = (): null => null;

function ordonneeDuGeste(evenement: DragMoveEvent): number | undefined {
  const depart = evenement.activatorEvent;
  if (depart instanceof MouseEvent) {
    return depart.clientY + evenement.delta.y;
  }
  const deplace = evenement.active.rect.current.translated;
  return deplace === null ? undefined : deplace.top + deplace.height / 2;
}

function survolDe(
  evenement: DragMoveEvent,
  admise: ProprietesListeGlissable["zoneAdmise"],
): Survol | undefined {
  const { over, active } = evenement;
  const ordonnee = ordonneeDuGeste(evenement);
  if (over === null || ordonnee === undefined) {
    return undefined;
  }
  const [actif, cible] = [String(active.id), String(over.id)];
  const zone = zoneDuPoint({ haut: over.rect.top, hauteur: over.rect.height }, ordonnee);
  return admise(actif, cible, zone) ? { actif, cible, zone } : undefined;
}

function annoncesDe(
  annonces: AnnoncesDuGlisser,
  survolCourant: () => Survol | undefined,
): Announcements {
  const nom = (id: UniqueIdentifier): string => String(id);
  return {
    onDragStart: ({ active }) => annonces.saisie(nom(active.id)),
    // Rien n'est annoncé tant que l'élément ne survole que sa propre place.
    onDragOver: ({ active, over }) => {
      if (over === null || over.id === active.id) {
        return undefined;
      }
      const survol = survolCourant();
      return annonces.survol(nom(active.id), survol?.cible, survol?.zone);
    },
    onDragEnd: ({ active }) => {
      const survol = survolCourant();
      return annonces.depot(nom(active.id), survol?.cible, survol?.zone);
    },
    onDragCancel: ({ active }) => annonces.abandon(nom(active.id)),
  };
}

function useCapteurs(touches: TouchesDuGlisser) {
  return useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: DISTANCE_D_ACTIVATION } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: {
        start: [...touches.saisir],
        end: [...touches.deposer],
        cancel: [...touches.abandonner],
      },
    }),
  );
}

interface SuiviDuGeste {
  readonly survol: Survol | undefined;
  readonly accessibilite: {
    announcements: Announcements;
    screenReaderInstructions: { draggable: string };
  };
  readonly commencer: () => void;
  readonly suivre: (evenement: DragMoveEvent) => void;
  readonly abandonner: () => void;
  readonly lacher: (evenement: DragMoveEvent) => void;
}

// Le dernier survol reste lu jusqu'au geste suivant : l'annonce du dépôt, émise après le lâcher, le
// nomme encore.
function useSuiviDuGeste(props: ProprietesListeGlissable): SuiviDuGeste {
  const [survol, setSurvol] = useState<Survol | undefined>(undefined);
  const dernier = useRef<Survol | undefined>(undefined);
  // Les dernières propriétés reçues, lues par les rappels du geste ; écrites après le rendu, jamais
  // pendant (comme `useOptionsRecues` de l'éditeur).
  const recues = useRef(props);
  useEffect(() => {
    recues.current = props;
  });
  const suivre = (evenement: DragMoveEvent): void => {
    const suivant = survolDe(evenement, recues.current.zoneAdmise);
    dernier.current = suivant;
    setSurvol((avant) =>
      avant?.cible === suivant?.cible && avant?.zone === suivant?.zone ? avant : suivant,
    );
  };
  const { annonces } = props;
  const accessibilite = useMemo(
    () => ({
      announcements: annoncesDe(annonces, () => dernier.current),
      screenReaderInstructions: { draggable: annonces.instructions },
    }),
    [annonces],
  );
  return {
    survol,
    accessibilite,
    commencer: () => {
      dernier.current = undefined;
    },
    suivre,
    abandonner: () => setSurvol(undefined),
    lacher: (evenement) => {
      suivre(evenement);
      setSurvol(undefined);
      const fin = dernier.current;
      const { identifiants, surLacher } = recues.current;
      // Le geste est abandonné si l'un des deux a quitté l'arborescence lue (F-006-AC8). Aucun test
      // n'échoue sans cette garde : `surLacher` recalcule la destination sur l'arborescence lue et
      // refuse déjà une page ou une cible disparue. Elle est gardée pour que la liste, réutilisable
      // (F-020), ne transmette jamais un identifiant qu'elle n'affiche plus, quel que soit
      // l'appelant.
      if (fin !== undefined && [fin.actif, fin.cible].every((id) => identifiants.includes(id))) {
        surLacher(fin.actif, fin.cible, fin.zone);
      }
    },
  };
}

export function ListeGlissable(props: ProprietesListeGlissable): ReactElement {
  const capteurs = useCapteurs(props.touches);
  const geste = useSuiviDuGeste(props);
  return (
    <DndContext
      sensors={capteurs}
      collisionDetection={detection}
      accessibility={geste.accessibilite}
      onDragStart={geste.commencer}
      onDragMove={geste.suivre}
      onDragOver={geste.suivre}
      onDragCancel={geste.abandonner}
      onDragEnd={geste.lacher}
    >
      <SortableContext
        items={props.identifiants as string[]}
        strategy={SANS_ECARTEMENT}
        disabled={props.desactivee}
      >
        <ContexteDuSurvol value={geste.survol}>{props.children}</ContexteDuSurvol>
      </SortableContext>
    </DndContext>
  );
}

// ——— Éléments répartis en plusieurs conteneurs : les piles d'un kanban (F-020-AC12, AC21, AC25) ———
//
// Un `DndContext`, un `SortableContext` par pile et chaque pile aussi zone de dépôt (H6, veille du
// 2026-10-27). La bibliothèque ne déplace rien d'une pile à l'autre : ce module ne dit que la nature
// de la cible (une carte ou une pile) et la pile ; le rang d'insertion est calculé par l'application
// (indice de la carte pour une cible carte, fin de pile pour une cible pile). Au pointeur seul : aucun
// capteur clavier n'est enregistré pour les piles, l'équivalent au clavier est fait de commandes
// (F-020-AC13).

/** Où la carte glissée tombe : sur une carte (avant ou après elle) ou sur une pile. */
export interface DepotSurUnePile {
  readonly sorte: "carte" | "pile";
  readonly actif: string;
  /** La pile de destination : celle de la carte survolée, ou la pile survolée. */
  readonly pile: string;
  /** La carte survolée, pour une cible carte. */
  readonly cible: string | undefined;
  /** Moitié de la carte survolée, pour une cible carte. */
  readonly zone: "avant" | "apres" | undefined;
}

/** Textes adressés aux technologies d'assistance pour les piles, fournis en français par l'application. */
export interface AnnoncesDesPiles {
  readonly instructions: string;
  saisie(actif: string): string;
  survol(actif: string, depot: DepotSurUnePile | undefined): string;
  depot(actif: string, depot: DepotSurUnePile | undefined): string;
  abandon(actif: string): string;
}

export interface ProprietesPilesGlissables {
  /** Identifiants des cartes et des piles affichées : un geste dont l'un a disparu n'écrit rien. */
  readonly identifiants: readonly string[];
  /** Vrai : aucun geste ne démarre (lecture seule, saisie ouverte). */
  readonly desactivee: boolean;
  readonly surLacher: (depot: DepotSurUnePile) => void;
  readonly annonces: AnnoncesDesPiles;
  /** Vrai : le geste ne vise que des piles, jamais une place entre deux cartes (un seul repère par pile). */
  readonly repereParPile?: boolean | undefined;
  readonly children: ReactNode;
}

interface DonneesDeCible {
  readonly pile?: boolean;
  readonly sortable?: { readonly containerId?: unknown };
}

function depotDe(evenement: DragMoveEvent, parPile: boolean): DepotSurUnePile | undefined {
  const { over, active } = evenement;
  if (over === null) {
    return undefined;
  }
  const donnees = (over.data.current ?? {}) as DonneesDeCible;
  const actif = String(active.id);
  if (donnees.pile === true) {
    return { sorte: "pile", actif, pile: String(over.id), cible: undefined, zone: undefined };
  }
  const conteneur = donnees.sortable?.containerId;
  if (typeof conteneur !== "string") {
    return undefined;
  }
  if (parPile) {
    return { sorte: "pile", actif, pile: conteneur, cible: undefined, zone: undefined };
  }
  // Sur sa propre place : la carte y reste (ni abandon, ni déplacement).
  if (over.id === active.id) {
    return { sorte: "carte", actif, pile: conteneur, cible: actif, zone: undefined };
  }
  const ordonnee = ordonneeDuGeste(evenement);
  if (ordonnee === undefined) {
    return undefined;
  }
  const zone = moitieDuPoint({ haut: over.rect.top, hauteur: over.rect.height }, ordonnee);
  return { sorte: "carte", actif, pile: conteneur, cible: String(over.id), zone };
}

function survolDuDepot(depot: DepotSurUnePile | undefined): Survol | undefined {
  return depot === undefined || depot.cible === depot.actif
    ? undefined
    : {
        actif: depot.actif,
        cible: depot.cible ?? depot.pile,
        zone: depot.zone ?? "dans",
      };
}

function annoncesDesPilesDe(
  annonces: AnnoncesDesPiles,
  depotCourant: () => DepotSurUnePile | undefined,
): Announcements {
  return {
    onDragStart: ({ active }) => annonces.saisie(String(active.id)),
    onDragOver: ({ active, over }) =>
      over === null || over.id === active.id
        ? undefined
        : annonces.survol(String(active.id), depotCourant()),
    onDragEnd: ({ active }) => annonces.depot(String(active.id), depotCourant()),
    onDragCancel: ({ active }) => annonces.abandon(String(active.id)),
  };
}

// Le dernier dépôt survolé reste lu jusqu'au geste suivant : l'annonce du dépôt, émise après le
// lâcher, le nomme encore. Une carte ou une pile qui n'est plus affichée n'est plus une cible.
function useSuiviDesPiles(props: ProprietesPilesGlissables) {
  const [survol, setSurvol] = useState<Survol | undefined>(undefined);
  const dernier = useRef<DepotSurUnePile | undefined>(undefined);
  const recues = useRef(props);
  useEffect(() => {
    recues.current = props;
  });
  const affiche = (depot: DepotSurUnePile | undefined): DepotSurUnePile | undefined =>
    depot !== undefined &&
    [depot.actif, depot.pile, depot.cible ?? depot.pile].every((id) =>
      recues.current.identifiants.includes(id),
    )
      ? depot
      : undefined;
  const suivre = (evenement: DragMoveEvent): void => {
    dernier.current = affiche(depotDe(evenement, recues.current.repereParPile === true));
    const suivant = survolDuDepot(dernier.current);
    setSurvol((avant) =>
      avant?.cible === suivant?.cible && avant?.zone === suivant?.zone ? avant : suivant,
    );
  };
  const { annonces } = props;
  const accessibilite = useMemo(
    () => ({
      announcements: annoncesDesPilesDe(annonces, () => dernier.current),
      screenReaderInstructions: { draggable: annonces.instructions },
    }),
    [annonces],
  );
  return {
    survol,
    accessibilite,
    commencer: () => {
      dernier.current = undefined;
    },
    suivre,
    abandonner: () => setSurvol(undefined),
    lacher: (evenement: DragMoveEvent) => {
      suivre(evenement);
      setSurvol(undefined);
      // Sur sa propre place, la carte reste où elle est : rien à écrire.
      if (dernier.current !== undefined && dernier.current.cible !== dernier.current.actif) {
        recues.current.surLacher(dernier.current);
      }
    },
  };
}

const CAPTEUR_AU_POINTEUR = { activationConstraint: { distance: DISTANCE_D_ACTIVATION } };
// Désactivé, le capteur reste en place (la bibliothèque relit la liste des capteurs à chaque rendu et
// n'admet pas qu'elle change de taille) mais aucune distance ne suffit à démarrer un geste.
const CAPTEUR_BLOQUE = { activationConstraint: { distance: Number.POSITIVE_INFINITY } };

export function PilesGlissables(props: ProprietesPilesGlissables): ReactElement {
  const capteurs = useSensors(
    useSensor(PointerSensor, props.desactivee ? CAPTEUR_BLOQUE : CAPTEUR_AU_POINTEUR),
  );
  const geste = useSuiviDesPiles(props);
  return (
    <DndContext
      sensors={capteurs}
      collisionDetection={pointerWithin}
      accessibility={geste.accessibilite}
      onDragStart={geste.commencer}
      onDragMove={geste.suivre}
      onDragOver={geste.suivre}
      onDragCancel={geste.abandonner}
      onDragEnd={geste.lacher}
    >
      <ContexteDuSurvol value={geste.survol}>{props.children}</ContexteDuSurvol>
    </DndContext>
  );
}

function ContenuDePile(props: {
  readonly id: string;
  readonly children: (pile: ZoneDePile) => ReactNode;
}): ReactNode {
  return props.children(useZoneDePile(props.id));
}

/** Une pile : ses cartes, dans l'ordre affiché, forment un contexte triable ; elle reçoit aussi un dépôt. */
export function PileGlissable(props: {
  readonly id: string;
  readonly identifiants: readonly string[];
  readonly desactivee: boolean;
  readonly children: (pile: ZoneDePile) => ReactNode;
}): ReactElement {
  return (
    <SortableContext
      id={props.id}
      items={props.identifiants as string[]}
      strategy={SANS_ECARTEMENT}
      disabled={props.desactivee}
    >
      <ContenuDePile id={props.id}>{props.children}</ContenuDePile>
    </SortableContext>
  );
}
