// Session d'espace (ADR-0007) : créée hors de React, seule abonnée de la façade du document.
import { type Arborescence, type DocumentEspace, ouvrirDocumentEspace } from "@notionlike/document";
import * as Y from "yjs";

import { ouvrirEspaceLocal, type PersistanceEspaceLocal } from "../persistance/index.ts";
import { suivreLOnglet } from "./garde-onglet.ts";
import { estDUneVersionAdmise, lectureAdmise } from "./garde-version.ts";

type OperationsEspace = Pick<
  DocumentEspace,
  "creerPage" | "renommerPage" | "mettreALaCorbeille" | "restaurerPage" | "supprimerDefinitivement"
>;

export type EtatSession =
  | { readonly phase: "contexte-non-securise" }
  | { readonly phase: "chargement" }
  | {
      readonly phase: "version-non-prise-en-charge";
      /** Vrai : des modifications faites depuis l'ouverture ne sont écrites nulle part. */
      readonly modificationsPerdues: boolean;
    }
  | {
      readonly phase: "pret";
      readonly arborescence: Arborescence;
      /**
       * Espace dont l'arborescence est affichée, tel que l'appareil l'a retenu : il désigne la base
       * de chaque page (F-003-AC1). `undefined` tant que le stockage n'a pas pu le dire.
       */
      readonly idEspace: string | undefined;
      /**
       * Vrai seulement après la preuve d'écriture (F-030-AC26). Faux : ce qui est saisi n'est pas
       * encore enregistré, l'avertissement est affiché et des tentatives de reprise se suivent.
       */
      readonly enregistre: boolean;
      /** Faux tant que ce que l'appareil portait déjà n'a pas pu être lu (F-030-AC13). */
      readonly baseRelue: boolean;
      /** Vrai : des pages d'avant restent sur l'appareil sans être rattachées (F-030-AC23). */
      readonly basesNonRattachees: boolean;
      readonly operations: OperationsEspace;
      /** Demande une tentative de reprise immédiate (F-030-AC2). */
      readonly reessayer: () => void;
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

const SIGNALEMENT_D_UN_ABONNE_DE_SESSION =
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
  // Ramasse-miettes actif, explicitement : le contenu d'une page supprimée définitivement est libéré
  // du document tenu en mémoire et de son état encodé (F-007-AC29, H14).
  const doc = new Y.Doc({ gc: true });
  return sessionOuverte(doc, ouvrirEspaceLocal(doc, crypto.randomUUID()));
}

// La fonction réellement requise est testée, pas `isSecureContext` (F-002-AC26).
function peutCreerDesIdentifiants(): boolean {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function";
}

interface Diffusion {
  lire(): EtatSession;
  publier(suivant: EtatSession): void;
  abonner(rappel: () => void): () => void;
  oublierLesAbonnes(): void;
}

// État de la session et ses abonnés. `publier` est la seule fonction qui prévient les abonnés de
// la session, que le changement vienne du document ou de la persistance (F-002-AC29). La copie
// tient à l'écart les abonnés inscrits pendant la diffusion ; le test d'appartenance écarte ceux
// qu'un rappel précédent vient de désabonner, et tous dès que la session est fermée.
function creerDiffusion(): Diffusion {
  let etat: EtatSession = CHARGEMENT;
  const abonnes = new Set<() => void>();
  return {
    lire: () => etat,
    publier: (suivant) => {
      etat = suivant;
      for (const notifier of [...abonnes]) {
        if (abonnes.has(notifier)) {
          notifierSousGarde(notifier);
        }
      }
    },
    abonner: (rappel) => {
      const notifier = (): void => rappel();
      abonnes.add(notifier);
      return () => void abonnes.delete(notifier);
    },
    oublierLesAbonnes: () => abonnes.clear(),
  };
}

function sessionOuverte(doc: Y.Doc, persistance: PersistanceEspaceLocal): SessionEspace {
  const session = new SessionOuverte(doc, persistance);
  return { lireEtat: session.lireEtat, abonner: session.abonner, doc, fermer: session.fermer };
}

class SessionOuverte {
  readonly #doc: Y.Doc;
  readonly #persistance: PersistanceEspaceLocal;
  readonly #diffusion = creerDiffusion();
  readonly #arrets: readonly (() => void)[];
  #ouverte: FacadeOuverte | undefined;
  #etatReluRefuse = false;

  constructor(doc: Y.Doc, persistance: PersistanceEspaceLocal) {
    this.#doc = doc;
    this.#persistance = persistance;
    // La base peut porter une version de format que cette application ne prend pas en charge : la
    // persistance soumet l'état relu avant toute fusion, à l'ouverture comme à chaque reprise, et
    // se ferme sur un refus (F-030-AC10).
    persistance.soumettreLEtatRelu((temoin) => {
      this.#etatReluRefuse = !estDUneVersionAdmise(temoin);
      return !this.#etatReluRefuse;
    });
    this.#arrets = [persistance.abonner(this.#surPersistance), suivreLOnglet(persistance)];
    this.#surPersistance();
  }

  readonly lireEtat = (): EtatSession => this.#diffusion.lire();

  readonly abonner = (rappel: () => void): (() => void) => this.#diffusion.abonner(rappel);

  readonly fermer = (): void => {
    this.#diffusion.oublierLesAbonnes();
    this.#fermerFacadeEtPersistance();
  };

  // Chacune de ces fermetures est sans effet la seconde fois. Une session fermée n'écoute plus ni
  // la persistance ni l'onglet.
  #fermerFacadeEtPersistance(): void {
    this.#arrets.forEach((arreter) => arreter());
    this.#ouverte?.facade.fermer();
    this.#persistance.fermer();
  }

  // Définitif jusqu'au rechargement, et sans aucune tentative ultérieure (F-030-AC11). Ce que le
  // document porte de non enregistré est relevé avant la fermeture : il ne sera écrit nulle part.
  #bloquerPourVersion(): void {
    const modificationsPerdues = this.#persistance.aDesModificationsNonEnregistrees();
    this.#fermerFacadeEtPersistance();
    this.#diffusion.publier({ phase: "version-non-prise-en-charge", modificationsPerdues });
  }

  #recalculer({ facade, operations }: FacadeOuverte): void {
    const arborescence = lectureAdmise(facade);
    if (arborescence === undefined) {
      // Après une mise à jour reçue, la session est ici dans le rappel que la façade est en train
      // d'appeler : elle la ferme pendant sa diffusion, ce que la façade permet sans rien lever,
      // puis prévient ses propres abonnés (F-002-AC17, AC30).
      this.#bloquerPourVersion();
      return;
    }
    const suivant: EtatPret = {
      phase: "pret",
      arborescence,
      idEspace: this.#persistance.idEspace(),
      enregistre: this.#persistance.lireEtat() === "active",
      baseRelue: this.#persistance.aReluLaBase(),
      basesNonRattachees: this.#persistance.aLaisseDesBasesNonRattachees(),
      operations,
      reessayer: this.#persistance.reessayer,
    };
    if (!memeEtatPret(this.#diffusion.lire(), suivant)) {
      this.#diffusion.publier(suivant);
    }
  }

  // La façade n'existe pas tant que la relecture dure : aucune action de modification n'est alors
  // possible (F-002-AC3).
  readonly #surPersistance = (): void => {
    if (this.#etatReluRefuse) {
      this.#bloquerPourVersion();
      return;
    }
    if (this.#persistance.lireEtat() === "relecture") {
      return;
    }
    if (this.#ouverte === undefined) {
      const facade = ouvrirDocumentEspace(this.#doc);
      const nouvelle: FacadeOuverte = { facade, operations: operationsDe(facade) };
      this.#ouverte = nouvelle;
      facade.abonner(() => this.#recalculer(nouvelle));
    }
    this.#recalculer(this.#ouverte);
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
    console.error(SIGNALEMENT_D_UN_ABONNE_DE_SESSION, exception);
  }
}

function operationsDe(facade: DocumentEspace): OperationsEspace {
  return {
    creerPage: facade.creerPage,
    renommerPage: facade.renommerPage,
    mettreALaCorbeille: facade.mettreALaCorbeille,
    restaurerPage: facade.restaurerPage,
    supprimerDefinitivement: facade.supprimerDefinitivement,
  };
}

/** L'état d'une session dont l'espace est ouvert : celui que l'écran de l'espace lit. */
export type EtatPret = Extract<EtatSession, { phase: "pret" }>;

// Ce que l'écran lit d'un état prêt : les opérations et la demande de tentative ne changent pas.
function memeEtatPret(etat: EtatSession, suivant: EtatPret): boolean {
  return (
    etat.phase === "pret" &&
    etat.arborescence === suivant.arborescence &&
    etat.idEspace === suivant.idEspace &&
    etat.enregistre === suivant.enregistre &&
    etat.baseRelue === suivant.baseRelue &&
    etat.basesNonRattachees === suivant.basesNonRattachees
  );
}
