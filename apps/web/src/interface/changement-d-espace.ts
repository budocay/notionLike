// Changement d'espace vu de l'interface (F-032-AC10 à AC13, AC29, AC35). Une demande est examinée
// dans cet ordre : (1) une modification n'est enregistrée nulle part, la demande de confirmation
// avant de quitter étant armée : boîte d'AC13 ; (2) l'espace ouvert est `local` : changement ;
// (3) il est adopté : attente d'acquittement, 2 secondes au plus, puis changement, ou boîte d'AC12.
// Le changement lui-même revient à l'accueil puis passe la main au pilote de l'onglet, qui ferme
// l'espace quitté avant d'ouvrir l'espace choisi ; l'interface est alors remontée en entier.
//
// API offerte aux écrans des espaces (« Ouvrir cet espace ») : `ContexteDuChangement`, que lit
// `useChangementOffert()` ; absent quand l'application n'a pas de pilote (tests d'avant F-032).
import { createContext, useContext, useEffect, useRef, useState } from "react";

import { estUnNomDEspace } from "../compte/regles-espaces.ts";
import type { Droit, EtatDeLAppareil, MagasinDeLAppareil } from "../espace/appareil.ts";
import { type CibleDeSession, memeCible, type PiloteDeLOnglet } from "../espace/espace-ouvert.ts";
import { confirmationArmee } from "../espace/garde-onglet.ts";
import { allerA } from "../navigation/fragment.ts";
import type {
  EtatDeSynchronisation,
  IssueDeLAttente,
  Synchronisation,
} from "../synchronisation/index.ts";
import {
  CHANGEMENT_D_ESPACE_EN_COURS,
  ESPACE_DE_CET_APPAREIL,
  NOM_INCONNU_SUR_CET_APPAREIL,
} from "./messages-espaces.ts";
import { type Boite, useBoite } from "./outils-espaces.ts";

/** Attente d'acquittement d'un espace adopté avant de le quitter (F-032-AC12). */
export const ATTENTE_DU_CHANGEMENT_MS = 2000;

/** Ce que l'entrée donne à l'application quand l'onglet a un pilote (F-032). */
export interface EspacesDeLApplication {
  readonly pilote: PiloteDeLOnglet;
  readonly magasin: MagasinDeLAppareil;
  /** L'espace ouvert, tel que le pilote l'a ouvert. */
  readonly cible: CibleDeSession;
  /** Le droit que le registre donnait à l'ouverture ; `undefined` : aucune entrée lue. */
  readonly droit: Droit | undefined;
  /** Le nom à annoncer à l'arrivée ; absent au lancement. */
  readonly arrivee: string | undefined;
}

/** Une demande de changement d'espace, faite par une commande des écrans des espaces. */
export interface DemandeDeChangement {
  readonly cible: CibleDeSession;
  /** Le nom de l'espace choisi, tel que l'écran l'affiche : il est annoncé à l'arrivée. */
  readonly nom: string;
  /** Où rendre le focus quand la commande d'origine a disparu (F-032-AC29) : la liste. */
  readonly repli?: HTMLElement | null | undefined;
}

export interface ChangementDEspace {
  /** Examine la demande ; sans effet vers l'espace ouvert, ou tant qu'une autre est en cours. */
  demander(demande: DemandeDeChangement): void;
  /**
   * Raison qui désactive les autres demandes pendant l'attente d'acquittement (« Changement
   * d'espace… », F-032-AC12) ; `undefined` hors de l'attente.
   */
  readonly attente: string | undefined;
  /** L'espace dont la demande attend l'acquittement : sa commande reste active (F-032-AC12). */
  readonly cibleEnAttente: CibleDeSession | undefined;
}

/** L'API du changement, offerte aux écrans des espaces par l'écran de l'espace ouvert. */
export const ContexteDuChangement = createContext<ChangementDEspace | undefined>(undefined);

/** L'API du changement ; `undefined` quand l'application n'a pas de pilote. */
export function useChangementOffert(): ChangementDEspace | undefined {
  return useContext(ContexteDuChangement);
}

/** La confirmation ouverte : AC13 (`nulle-part`) ou AC12 (`non-transmises`). */
export interface ConfirmationOuverte {
  readonly sorte: "nulle-part" | "non-transmises";
  /** Le nom de l'espace ouvert, que la boîte cite. */
  readonly nomOuvert: string;
  readonly rester: () => void;
  readonly changer: () => void;
}

export interface MoyensDuChangement {
  /** Absent : l'application n'a pas de pilote, aucune demande n'est suivie d'effet. */
  readonly espaces: EspacesDeLApplication | undefined;
  readonly synchro: Synchronisation | undefined;
  readonly etat: EtatDeSynchronisation | undefined;
  /** Ferme ce que l'écran tient de l'espace quitté : pages, tables, synchronisation. */
  readonly avant: () => void;
  /** Le nom de l'espace ouvert, tel que le sélecteur l'affiche : les boîtes le citent. */
  readonly nomOuvert: string;
}

interface Attendue {
  readonly sorte: ConfirmationOuverte["sorte"];
  readonly demande: DemandeDeChangement;
}

/**
 * Le dernier nom connu d'un espace de l'appareil, affiché seulement s'il passe la règle des
 * contrats (F-032-AC3) ; à défaut, « Espace de cet appareil » ou « Nom inconnu sur cet appareil ».
 */
export function nomDeLEspace(appareil: EtatDeLAppareil, cible: CibleDeSession): string {
  const nom =
    cible.sorte === "appareil"
      ? appareil.espaceDeLAppareil?.nom
      : appareil.autres.find((espace) => espace.idEspace === cible.idEspace)?.nom;
  if (nom !== undefined && estUnNomDEspace(nom)) {
    return nom;
  }
  return cible.sorte === "appareil" ? ESPACE_DE_CET_APPAREIL : NOM_INCONNU_SUR_CET_APPAREIL;
}

/**
 * Le changement d'espace (F-032-AC10), sans attente ni confirmation : l'adresse revient à
 * l'accueil, puis le pilote ferme l'espace quitté (`avant`, puis sa session) et ouvre l'espace
 * choisi. Seul appel du changement du pilote dans l'interface (F-032-AC32).
 */
export function changerDEspace(
  espaces: EspacesDeLApplication,
  demande: DemandeDeChangement,
  avant: () => void,
): void {
  if (memeCible(espaces.cible, demande.cible)) {
    return;
  }
  allerA({ forme: "accueil" });
  espaces.pilote.changer(demande.cible, { avant, nom: demande.nom });
}

/**
 * Le crochet du changement d'espace de l'écran ouvert : l'API offerte aux écrans des espaces et la
 * confirmation à rendre, s'il y en a une.
 */
export function useChangementDEspace(moyens: MoyensDuChangement): {
  readonly changement: ChangementDEspace;
  readonly confirmation: ConfirmationOuverte | undefined;
} {
  const derniers = useRef(moyens);
  derniers.current = moyens;
  const repli = useRef<HTMLElement | null>(null);
  const boite = useBoite<Attendue>(repli);
  const [enAttente, setEnAttente] = useState<CibleDeSession | undefined>(undefined);
  const occupe = useRef(false);
  const monte = useMonte();
  const changer = (demande: DemandeDeChangement): void => {
    const { espaces, avant } = derniers.current;
    if (espaces !== undefined) {
      changerDEspace(espaces, demande, avant);
    }
  };
  const examen: Examen = { derniers, repli, boite, occupe, monte, setEnAttente, changer };
  const ouverte = boite.ouverte;
  return {
    changement: {
      demander: (demande) => examiner(examen, demande),
      attente: enAttente === undefined ? undefined : CHANGEMENT_D_ESPACE_EN_COURS,
      cibleEnAttente: enAttente,
    },
    confirmation:
      ouverte === undefined
        ? undefined
        : {
            sorte: ouverte.sorte,
            nomOuvert: moyens.nomOuvert,
            rester: () => {
              occupe.current = false;
              boite.fermer();
            },
            changer: () => {
              occupe.current = false;
              changer(ouverte.demande);
            },
          },
  };
}

interface Examen {
  readonly derniers: { readonly current: MoyensDuChangement };
  readonly repli: { current: HTMLElement | null };
  readonly boite: Boite<Attendue>;
  /** Vrai d'une demande acceptée à la fin de son examen : les autres sont ignorées. */
  readonly occupe: { current: boolean };
  readonly monte: { readonly current: boolean };
  readonly setEnAttente: (enAttente: CibleDeSession | undefined) => void;
  readonly changer: (demande: DemandeDeChangement) => void;
}

// L'ordre d'examen d'une demande (F-032-AC13, puis AC12) ; l'origine est la commande qui a le focus
// au moment de la demande, où le focus revient si l'utilisateur reste sur l'espace.
function examiner(examen: Examen, demande: DemandeDeChangement): void {
  const { espaces, synchro, etat } = examen.derniers.current;
  if (espaces === undefined || examen.occupe.current || memeCible(espaces.cible, demande.cible)) {
    return;
  }
  examen.repli.current = demande.repli ?? null;
  const origine = document.activeElement;
  if (confirmationArmee()) {
    examen.occupe.current = true;
    examen.boite.ouvrir({ sorte: "nulle-part", demande }, origine);
    return;
  }
  if (!estAdopte(espaces, etat)) {
    examen.changer(demande);
    return;
  }
  examen.occupe.current = true;
  examen.setEnAttente(demande.cible);
  void attendreAvantDeChanger(synchro).then((issue) => {
    if (!examen.monte.current) {
      return;
    }
    examen.setEnAttente(undefined);
    if (issue === "acquitte") {
      examen.occupe.current = false;
      examen.changer(demande);
    } else {
      examen.boite.ouvrir({ sorte: "non-transmises", demande }, origine);
    }
  });
}

// Vrai entre le montage et le démontage ; `StrictMode` démonte puis remonte, d'où l'effet.
function useMonte(): { readonly current: boolean } {
  const monte = useRef(false);
  useEffect(() => {
    monte.current = true;
    return () => {
      monte.current = false;
    };
  }, []);
  return monte;
}

// Adopté : le registre lu par la synchronisation le dit ; avant sa lecture, l'entrée lue par le
// pilote à l'ouverture (une entrée du registre est toujours celle d'un espace adopté).
function estAdopte(
  espaces: EspacesDeLApplication,
  etat: EtatDeSynchronisation | undefined,
): boolean {
  if (etat?.registreLu === true) {
    return etat.rattachement === "adopte";
  }
  return espaces.droit !== undefined;
}

// Sans synchronisation, rien ne peut être acquitté : la boîte d'AC12 dit où restent les
// modifications. L'attente n'est jamais rejetée ; un rejet vaudrait « non acquitté ».
function attendreAvantDeChanger(synchro: Synchronisation | undefined): Promise<IssueDeLAttente> {
  if (synchro === undefined) {
    return Promise.resolve("non-acquitte");
  }
  return synchro
    .attendreLAcquittement(ATTENTE_DU_CHANGEMENT_MS)
    .catch((): IssueDeLAttente => "non-acquitte");
}
