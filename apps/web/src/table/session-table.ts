// Session de table (F-018-AC13 à AC15, ADR-0019), sur le modèle de la session de page : elle juge
// l'état relu de la base avant toute fusion, ouvre la façade du document de table par
// `ouvrirDocumentTable` seul (jamais `creerDocumentTable` : aucune écriture à l'ouverture, H5),
// publie son état et ferme la façade. Ni React, ni les vues. Le document et sa persistance lui sont
// prêtés : ils peuvent lui survivre (F-018-AC14).
import { type DocumentTable, ErreurDocument, ouvrirDocumentTable } from "@notionlike/document";
import type * as Y from "yjs";

import type { Persistance } from "../persistance/index.ts";

/** Ce que la façade du document de table refuse de lire (F-017-AC22, AC23). */
type RefusDeTable = "version-non-prise-en-charge" | "illisible";

export type EtatSessionTable =
  | { readonly phase: "chargement" }
  /** L'un des deux identifiants n'a pas la forme admise : rien n'a été ouvert. */
  | { readonly phase: "introuvable" }
  /** Version de format non prise en charge (F-018-AC15) : rien n'est écrit dans la base. */
  | { readonly phase: "version-non-prise-en-charge" }
  /** Document d'un autre genre (F-018-AC15) : rien n'est écrit dans la base. */
  | { readonly phase: "illisible" }
  | {
      readonly phase: "pret";
      /** Seule voie vers le document : les vues n'importent pas yjs (F-018-AC54). */
      readonly table: DocumentTable;
      /** Faux : la table ne vit qu'en mémoire, l'avertissement est affiché (F-018-AC14). */
      readonly enregistre: boolean;
      /** Faux tant que ce que l'appareil portait de cette table n'a pas pu être lu. */
      readonly baseRelue: boolean;
      readonly reessayer: () => void;
    };

export interface SessionTable {
  lireEtat(): EtatSessionTable;
  abonner(rappel: () => void): () => void;
  /** Ferme la façade et oublie les abonnés ; sans effet la seconde fois. */
  fermer(): void;
}

/** Un document de table et sa persistance. */
export interface DocumentDeTable {
  readonly doc: Y.Doc;
  readonly persistance: Persistance;
}

const CHARGEMENT: EtatSessionTable = { phase: "chargement" };
const INTROUVABLE: EtatSessionTable = { phase: "introuvable" };
const REFUS: Readonly<Record<RefusDeTable, EtatSessionTable>> = {
  "version-non-prise-en-charge": { phase: "version-non-prise-en-charge" },
  illisible: { phase: "illisible" },
};

const SIGNALEMENT_D_UN_ABONNE_DE_SESSION_DE_TABLE =
  "@notionlike/web : un abonné de la session de table a levé pendant la diffusion d'un changement.";

/** Session d'une table dont un identifiant est refusé : ni document, ni base, ni façade. */
export function sessionDeTableIntrouvable(): SessionTable {
  return { lireEtat: () => INTROUVABLE, abonner: () => () => undefined, fermer: () => undefined };
}

export function demarrerSessionTable(document: DocumentDeTable): SessionTable {
  const session = new SessionDeTable(document);
  return { lireEtat: session.lireEtat, abonner: session.abonner, fermer: session.fermer };
}

/**
 * Le refus que la façade oppose à ce document, ou `undefined` s'il se lit. La façade ne vit que le
 * temps de cette lecture ; toute autre exception est un défaut et remonte.
 */
export function refusDeLaTable(doc: Y.Doc): RefusDeTable | undefined {
  const facade = ouvrirDocumentTable(doc);
  try {
    return refusDeLaFacade(facade);
  } finally {
    facade.fermer();
  }
}

function refusDeLaFacade(facade: DocumentTable): RefusDeTable | undefined {
  try {
    facade.lire();
    return undefined;
  } catch (erreur) {
    if (erreur instanceof ErreurDocument && erreur.code === "version-non-prise-en-charge") {
      return "version-non-prise-en-charge";
    }
    if (erreur instanceof ErreurDocument && erreur.code === "pas-un-document-de-table") {
      return "illisible";
    }
    throw erreur;
  }
}

// Un abonné qui lève ne prive pas les suivants et ne remonte ni par `Y.applyUpdate`, ni par un
// rappel d'IndexedDB : son exception va à la console d'erreur, seul canal.
function prevenir(abonnes: ReadonlySet<() => void>): void {
  for (const notifier of [...abonnes]) {
    if (abonnes.has(notifier)) {
      try {
        notifier();
      } catch (exception) {
        console.error(SIGNALEMENT_D_UN_ABONNE_DE_SESSION_DE_TABLE, exception);
      }
    }
  }
}

class SessionDeTable {
  readonly #doc: Y.Doc;
  readonly #persistance: Persistance;
  readonly #abonnes = new Set<() => void>();
  readonly #cesserDeSuivre: () => void;
  #etat: EtatSessionTable = CHARGEMENT;
  #ouverte: DocumentTable | undefined;
  #refusRelu: RefusDeTable | undefined;
  #fermee = false;

  constructor({ doc, persistance }: DocumentDeTable) {
    this.#doc = doc;
    this.#persistance = persistance;
    // L'état relu est jugé avant toute fusion : sur un refus, la persistance se ferme sans avoir
    // rien écrit ni rien appliqué au document (F-018-AC15, F-030-AC10).
    persistance.soumettreLEtatRelu((temoin) => {
      this.#refusRelu = refusDeLaTable(temoin);
      return this.#refusRelu === undefined;
    });
    this.#cesserDeSuivre = persistance.abonner(this.#surPersistance);
    this.#surPersistance();
  }

  readonly lireEtat = (): EtatSessionTable => this.#etat;

  readonly abonner = (rappel: () => void): (() => void) => {
    if (this.#fermee) {
      return () => undefined;
    }
    const notifier = (): void => rappel();
    this.#abonnes.add(notifier);
    return () => void this.#abonnes.delete(notifier);
  };

  readonly fermer = (): void => {
    this.#fermee = true;
    this.#abonnes.clear();
    this.#cesserDeSuivre();
    this.#ouverte?.fermer();
  };

  #refusee(): boolean {
    return this.#etat.phase === "version-non-prise-en-charge" || this.#etat.phase === "illisible";
  }

  #publier(suivant: EtatSessionTable): void {
    this.#etat = suivant;
    prevenir(this.#abonnes);
  }

  // Refus de l'état relu ou du document ouvert : la persistance est fermée, rien n'est écrit.
  #refuserALOuverture(refus: RefusDeTable): void {
    this.#cesserDeSuivre();
    this.#ouverte?.fermer();
    this.#persistance.fermer();
    this.#publier(REFUS[refus]);
  }

  // Une version refusée reçue plus tard (synchronisation, ADR-0019) : ce qui est reçu reste
  // enregistré dans la base, la table n'est plus affichée ni modifiable sur l'appareil.
  readonly #surLaTable = (): void => {
    const facade = this.#ouverte;
    if (this.#fermee || this.#refusee() || facade === undefined) {
      return;
    }
    const refus = refusDeLaFacade(facade);
    if (refus !== undefined) {
      facade.fermer();
      this.#publier(REFUS[refus]);
    }
  };

  // La façade n'existe pas tant que la relecture dure : rien n'est lu avant que l'état relu ne
  // soit jugé (F-018-AC13).
  readonly #surPersistance = (): void => {
    if (this.#fermee || this.#refusee()) {
      return;
    }
    if (this.#refusRelu !== undefined) {
      this.#refuserALOuverture(this.#refusRelu);
      return;
    }
    if (this.#persistance.lireEtat() === "relecture") {
      return;
    }
    if (this.#ouverte === undefined) {
      const facade = ouvrirDocumentTable(this.#doc);
      this.#ouverte = facade;
      const refus = refusDeLaFacade(facade);
      if (refus !== undefined) {
        this.#refuserALOuverture(refus);
        return;
      }
      facade.abonner(this.#surLaTable);
    }
    this.#publierPret(this.#ouverte);
  };

  #publierPret(table: DocumentTable): void {
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
      table,
      enregistre,
      baseRelue,
      reessayer: this.#persistance.reessayer,
    });
  }
}
