// Session d'espace (ADR-0007) : créée hors de React, seule abonnée de la façade du document.
import {
  type Arborescence,
  type DocumentEspace,
  ErreurDocument,
  ouvrirDocumentEspace,
} from "@notionlike/document";
import * as Y from "yjs";

import { ouvrirEspaceLocal, type PersistanceEspaceLocal } from "../persistance/index.ts";

export type OperationsEspace = Pick<
  DocumentEspace,
  "creerPage" | "renommerPage" | "mettreALaCorbeille"
>;

export type EtatSession =
  | { readonly phase: "contexte-non-securise" }
  | { readonly phase: "chargement" }
  | { readonly phase: "version-non-prise-en-charge" }
  | {
      readonly phase: "pret";
      /** Identifiant de l'espace local : il désigne aussi les documents de ses pages. */
      readonly idEspace: string;
      readonly arborescence: Arborescence;
      /** Faux : la session ne vit qu'en mémoire, l'avertissement est affiché. */
      readonly enregistre: boolean;
      readonly operations: OperationsEspace;
    };

export interface SessionEspace {
  lireEtat(): EtatSession;
  abonner(rappel: () => void): () => void;
  /** Absent hors contexte sécurisé ; reçoit les mises à jour. */
  readonly doc: Y.Doc | undefined;
}

const CONTEXTE_NON_SECURISE: EtatSession = { phase: "contexte-non-securise" };
const CHARGEMENT: EtatSession = { phase: "chargement" };
const VERSION_NON_PRISE_EN_CHARGE: EtatSession = { phase: "version-non-prise-en-charge" };

export function demarrerSessionEspace(): SessionEspace {
  if (!peutCreerDesIdentifiants()) {
    return {
      lireEtat: () => CONTEXTE_NON_SECURISE,
      abonner: () => () => undefined,
      doc: undefined,
    };
  }
  const doc = new Y.Doc();
  return sessionOuverte(doc, ouvrirEspaceLocal(doc, crypto.randomUUID()));
}

// La fonction réellement requise est testée, pas `isSecureContext` (F-002-AC26).
function peutCreerDesIdentifiants(): boolean {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function";
}

function sessionOuverte(doc: Y.Doc, persistance: PersistanceEspaceLocal): SessionEspace {
  let etat: EtatSession = CHARGEMENT;
  let facade: DocumentEspace | undefined;
  let operations: OperationsEspace | undefined;
  const abonnes = new Set<() => void>();

  const publier = (suivant: EtatSession): void => {
    etat = suivant;
    [...abonnes].forEach((notifier) => notifier());
  };

  const recalculer = (): void => {
    if (facade === undefined || operations === undefined || etat === VERSION_NON_PRISE_EN_CHARGE) {
      return;
    }
    const arborescence = lectureAdmise(facade);
    if (arborescence === undefined) {
      publier(VERSION_NON_PRISE_EN_CHARGE);
      persistance.fermer();
      return;
    }
    const enregistre = persistance.etat() === "active";
    if (!memeEtatPret(etat, arborescence, enregistre)) {
      const idEspace = persistance.idEspace();
      publier({ phase: "pret", idEspace, arborescence, enregistre, operations });
    }
  };

  const surPersistance = (): void => {
    if (persistance.etat() === "relecture") {
      return;
    }
    if (facade === undefined) {
      facade = ouvrirDocumentEspace(doc);
      operations = operationsDe(facade);
      facade.abonner(recalculer);
    }
    recalculer();
  };

  persistance.abonner(surPersistance);
  surPersistance();

  return {
    lireEtat: () => etat,
    abonner: (rappel) => {
      const notifier = (): void => rappel();
      abonnes.add(notifier);
      return () => void abonnes.delete(notifier);
    },
    doc,
  };
}

function operationsDe(facade: DocumentEspace): OperationsEspace {
  return {
    creerPage: facade.creerPage,
    renommerPage: facade.renommerPage,
    mettreALaCorbeille: facade.mettreALaCorbeille,
  };
}

// `undefined` : la façade refuse la version du document (F-002-AC17).
function lectureAdmise(facade: DocumentEspace): Arborescence | undefined {
  try {
    return facade.lire();
  } catch (erreur) {
    if (erreur instanceof ErreurDocument && erreur.code === "version-non-prise-en-charge") {
      return undefined;
    }
    throw erreur;
  }
}

function memeEtatPret(etat: EtatSession, arborescence: Arborescence, enregistre: boolean): boolean {
  return (
    etat.phase === "pret" && etat.arborescence === arborescence && etat.enregistre === enregistre
  );
}
