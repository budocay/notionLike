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
import { type ReactElement, type ReactNode, useMemo, useRef, useState } from "react";

import { ContexteDuSurvol, type Survol } from "./survol.ts";
import { type ZoneDeDepot, zoneDuPoint } from "./zone.ts";

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
  const recues = useRef(props);
  recues.current = props;
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
      // Le geste est abandonné si l'un des deux a quitté l'arborescence lue (F-006-AC8).
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
