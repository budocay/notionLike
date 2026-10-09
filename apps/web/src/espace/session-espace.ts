// Session d'espace (ADR-0007) : créée hors de React, seule abonnée de la façade du document.
import {
  type Arborescence,
  type DocumentEspace,
  ErreurDocument,
  ouvrirDocumentEspace,
} from "@notionlike/document";
import * as Y from "yjs";

import { ouvrirEspaceLocal, type Persistance } from "../persistance/index.ts";

type OperationsEspace = Pick<DocumentEspace, "creerPage" | "renommerPage" | "mettreALaCorbeille">;

export type EtatSession =
  | { readonly phase: "contexte-non-securise" }
  | { readonly phase: "chargement" }
  | { readonly phase: "version-non-prise-en-charge" }
  | {
      readonly phase: "pret";
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
  /** Ferme la façade et la persistance, oublie les abonnés ; sans effet la seconde fois. */
  fermer(): void;
}

const CONTEXTE_NON_SECURISE: EtatSession = { phase: "contexte-non-securise" };
const CHARGEMENT: EtatSession = { phase: "chargement" };
const VERSION_NON_PRISE_EN_CHARGE: EtatSession = { phase: "version-non-prise-en-charge" };

const SIGNALEMENT_DE_L_ABONNE_FAUTIF =
  "@notionlike/web : un abonné de la session d'espace a levé pendant la diffusion d'un changement.";

export function demarrerSessionEspace(): SessionEspace {
  if (!peutCreerDesIdentifiants()) {
    return {
      lireEtat: () => CONTEXTE_NON_SECURISE,
      abonner: () => () => undefined,
      doc: undefined,
      fermer: () => undefined,
    };
  }
  const doc = new Y.Doc();
  return sessionOuverte(doc, ouvrirEspaceLocal(doc, crypto.randomUUID()));
}

// La fonction réellement requise est testée, pas `isSecureContext` (F-002-AC26).
function peutCreerDesIdentifiants(): boolean {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function";
}

function sessionOuverte(doc: Y.Doc, persistance: Persistance): SessionEspace {
  let etat: EtatSession = CHARGEMENT;
  let ouverte: FacadeOuverte | undefined;
  const abonnes = new Set<() => void>();

  // Seule fonction qui prévient les abonnés de la session, que le changement vienne du document ou
  // de la persistance (F-002-AC29). La copie tient à l'écart les abonnés inscrits pendant la
  // diffusion ; le test d'appartenance écarte ceux qu'un rappel précédent vient de désabonner, et
  // tous dès que la session est fermée.
  const publier = (suivant: EtatSession): void => {
    etat = suivant;
    for (const notifier of [...abonnes]) {
      if (abonnes.has(notifier)) {
        notifierSousGarde(notifier);
      }
    }
  };

  // Chacune de ces trois fermetures est sans effet la seconde fois.
  const fermerFacadeEtPersistance = (): void => {
    desabonnerDeLaPersistance();
    ouverte?.facade.fermer();
    persistance.fermer();
  };

  const recalculer = ({ facade, operations }: FacadeOuverte): void => {
    const arborescence = lectureAdmise(facade);
    if (arborescence === undefined) {
      // Définitif jusqu'au rechargement. Après une mise à jour reçue, la session est ici dans le
      // rappel que la façade est en train d'appeler : elle la ferme pendant sa diffusion, ce que
      // la façade permet sans rien lever, puis prévient ses propres abonnés (F-002-AC17, AC30).
      fermerFacadeEtPersistance();
      publier(VERSION_NON_PRISE_EN_CHARGE);
      return;
    }
    const enregistre = persistance.etat() === "active";
    if (!memeEtatPret(etat, arborescence, enregistre)) {
      publier({ phase: "pret", arborescence, enregistre, operations });
    }
  };

  // La façade n'existe pas tant que la relecture dure : aucune action de modification n'est alors
  // possible (F-002-AC3). Une session fermée n'écoute plus la persistance, et n'ouvre donc rien.
  const surPersistance = (): void => {
    if (persistance.etat() === "relecture") {
      return;
    }
    if (ouverte === undefined) {
      const facade = ouvrirDocumentEspace(doc);
      const nouvelle: FacadeOuverte = { facade, operations: operationsDe(facade) };
      ouverte = nouvelle;
      facade.abonner(() => recalculer(nouvelle));
    }
    recalculer(ouverte);
  };

  const desabonnerDeLaPersistance = persistance.abonner(surPersistance);
  surPersistance();

  return {
    lireEtat: () => etat,
    abonner: (rappel) => {
      const notifier = (): void => rappel();
      abonnes.add(notifier);
      return () => void abonnes.delete(notifier);
    },
    doc,
    fermer: () => {
      abonnes.clear();
      fermerFacadeEtPersistance();
    },
  };
}

interface FacadeOuverte {
  readonly facade: DocumentEspace;
  readonly operations: OperationsEspace;
}

// Un abonné qui lève ne prive pas les suivants et ne remonte ni par une opération, ni par
// `Y.applyUpdate`, ni par un rappel d'IndexedDB : son exception va à la console d'erreur, seul
// canal, une fois par abonné fautif (F-002-AC29).
function notifierSousGarde(notifier: () => void): void {
  try {
    notifier();
  } catch (exception) {
    console.error(SIGNALEMENT_DE_L_ABONNE_FAUTIF, exception);
  }
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
