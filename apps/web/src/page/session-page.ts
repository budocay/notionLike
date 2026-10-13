// Session de page (F-003 H3, H6), sur le modèle de la session d'espace : elle lit la version du
// document de page entièrement relu avant que quoi que ce soit ne le lie, tient sa façade, et la
// ferme. Ni React, ni bibliothèque d'édition. Le document et sa persistance lui sont prêtés : ils
// peuvent lui survivre (F-003-AC18).
import { type DocumentPage, ErreurDocument, ouvrirDocumentPage } from "@notionlike/document";
import type * as Y from "yjs";

import type { Persistance } from "../persistance/index.ts";

export type EtatSessionPage =
  | { readonly phase: "chargement" }
  /** L'un des deux identifiants n'a pas la forme admise : rien n'a été ouvert (F-003-AC36). */
  | { readonly phase: "introuvable" }
  | { readonly phase: "version-non-prise-en-charge" }
  | {
      readonly phase: "pret";
      readonly contenu: Y.XmlFragment;
      /**
       * `rappel` est appelé dans la transaction même qui inscrit une version non prise en charge,
       * avant tout observateur profond du contenu (F-003-AC29). Rend le désabonnement.
       */
      readonly garderVersion: (rappel: () => void) => () => void;
      /** Faux : la page ne vit qu'en mémoire, l'avertissement est affiché (F-003-AC18). */
      readonly enregistre: boolean;
      /** Faux tant que ce que l'appareil portait de cette page n'a pas pu être lu. */
      readonly baseRelue: boolean;
      readonly reessayer: () => void;
    };

export interface SessionPage {
  lireEtat(): EtatSessionPage;
  abonner(rappel: () => void): () => void;
  /** Ferme la façade et oublie les abonnés ; sans effet la seconde fois. */
  fermer(): void;
}

/** Un document de page et sa persistance. */
export interface DocumentDePage {
  readonly doc: Y.Doc;
  readonly persistance: Persistance;
}

const CHARGEMENT: EtatSessionPage = { phase: "chargement" };
const INTROUVABLE: EtatSessionPage = { phase: "introuvable" };
const VERSION_NON_PRISE_EN_CHARGE: EtatSessionPage = { phase: "version-non-prise-en-charge" };

const SIGNALEMENT_D_UN_ABONNE_DE_SESSION_DE_PAGE =
  "@notionlike/web : un abonné de la session de page a levé pendant la diffusion d'un changement.";

/** Session d'une page dont un identifiant est refusé : elle n'a ni document, ni base, ni façade. */
export function sessionDePageIntrouvable(): SessionPage {
  return { lireEtat: () => INTROUVABLE, abonner: () => () => undefined, fermer: () => undefined };
}

export function demarrerSessionPage(document: DocumentDePage): SessionPage {
  const session = new SessionDePage(document);
  return { lireEtat: session.lireEtat, abonner: session.abonner, fermer: session.fermer };
}

/**
 * Juge un document témoin, que rien n'affiche : sa façade ne vit que le temps de cette lecture.
 * Seul le refus de version est un refus (F-030-AC10, F-003-AC19).
 */
export function estUnePageDeVersionAdmise(temoin: Y.Doc): boolean {
  const facade = ouvertureAdmise(temoin);
  facade?.fermer();
  return facade !== undefined;
}

// `undefined` : la façade refuse la version du document.
function ouvertureAdmise(doc: Y.Doc): DocumentPage | undefined {
  try {
    return ouvrirDocumentPage(doc);
  } catch (erreur) {
    if (erreur instanceof ErreurDocument && erreur.code === "version-non-prise-en-charge") {
      return undefined;
    }
    throw erreur;
  }
}

// Un abonné qui lève ne prive pas les suivants et ne remonte ni par `Y.applyUpdate`, ni par un
// rappel d'IndexedDB : son exception va à la console d'erreur, seul canal, une fois par abonné
// fautif (F-003-AC34). La copie tient à l'écart les abonnés inscrits pendant la diffusion ; le
// test d'appartenance, ceux qu'un rappel précédent vient de désabonner.
function prevenir(abonnes: ReadonlySet<() => void>): void {
  for (const notifier of [...abonnes]) {
    if (abonnes.has(notifier)) {
      try {
        notifier();
      } catch (exception) {
        console.error(SIGNALEMENT_D_UN_ABONNE_DE_SESSION_DE_PAGE, exception);
      }
    }
  }
}

function inscrire(abonnes: Set<() => void>, rappel: () => void): () => void {
  const notifier = (): void => rappel();
  abonnes.add(notifier);
  return () => void abonnes.delete(notifier);
}

class SessionDePage {
  readonly #doc: Y.Doc;
  readonly #persistance: Persistance;
  readonly #abonnes = new Set<() => void>();
  readonly #gardes = new Set<() => void>();
  readonly #cesserDeSuivre: () => void;
  #etat: EtatSessionPage = CHARGEMENT;
  #ouverte: DocumentPage | undefined;
  #etatReluRefuse = false;
  #fermee = false;

  constructor({ doc, persistance }: DocumentDePage) {
    this.#doc = doc;
    this.#persistance = persistance;
    // La base peut porter une version que cette application ne prend pas en charge : l'état relu
    // est jugé avant toute fusion, et la persistance se ferme sur un refus sans avoir rien écrit
    // ni rien appliqué au document (F-030-AC10).
    persistance.soumettreLEtatRelu((temoin) => {
      this.#etatReluRefuse = !estUnePageDeVersionAdmise(temoin);
      return !this.#etatReluRefuse;
    });
    this.#cesserDeSuivre = persistance.abonner(this.#surPersistance);
    this.#surPersistance();
  }

  readonly lireEtat = (): EtatSessionPage => this.#etat;

  readonly abonner = (rappel: () => void): (() => void) =>
    this.#fermee ? () => undefined : inscrire(this.#abonnes, rappel);

  // Une seule fonction pour toute la session : l'éditeur ne se recrée pas quand l'état change.
  readonly #garderVersion = (rappel: () => void): (() => void) =>
    this.#fermee ? () => undefined : inscrire(this.#gardes, rappel);

  readonly fermer = (): void => {
    this.#fermee = true;
    this.#abonnes.clear();
    this.#gardes.clear();
    this.#cesserDeSuivre();
    this.#ouverte?.fermer();
  };

  #publier(suivant: EtatSessionPage): void {
    this.#etat = suivant;
    prevenir(this.#abonnes);
  }

  // Définitif : ni éditeur, ni liaison, ni écriture sur ce document (F-003-AC19, AC29). Les gardes
  // passent d'abord : l'éditeur est détruit avant que la façade ne soit fermée.
  #refuserLaVersion(): void {
    prevenir(this.#gardes);
    this.#gardes.clear();
    this.#cesserDeSuivre();
    this.#ouverte?.fermer();
    this.#persistance.fermer();
    this.#publier(VERSION_NON_PRISE_EN_CHARGE);
  }

  // La façade n'existe pas tant que la relecture dure : rien n'est lié avant que la version du
  // document entièrement relu ne soit connue (F-003-AC4, AC19).
  readonly #surPersistance = (): void => {
    if (this.#fermee || this.#etat === VERSION_NON_PRISE_EN_CHARGE) {
      return;
    }
    if (this.#etatReluRefuse) {
      this.#refuserLaVersion();
      return;
    }
    if (this.#persistance.lireEtat() === "relecture") {
      return;
    }
    if (this.#ouverte === undefined) {
      const facade = ouvertureAdmise(this.#doc);
      if (facade === undefined) {
        this.#refuserLaVersion();
        return;
      }
      this.#ouverte = facade;
      facade.garderVersion(() => this.#refuserLaVersion());
    }
    this.#publierPret(this.#ouverte);
  };

  #publierPret(facade: DocumentPage): void {
    const enregistre = this.#persistance.lireEtat() === "active";
    const baseRelue = this.#persistance.aReluLaBase();
    const avant = this.#etat;
    if (
      avant.phase === "pret" &&
      avant.enregistre === enregistre &&
      avant.baseRelue === baseRelue
    ) {
      return;
    }
    this.#publier({
      phase: "pret",
      contenu: facade.contenu,
      garderVersion: this.#garderVersion,
      enregistre,
      baseRelue,
      reessayer: this.#persistance.reessayer,
    });
  }
}
