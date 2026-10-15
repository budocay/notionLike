// Passe de fond (F-013-AC5, AC6, H6) : chaque page de l'arborescence et de la corbeille qui n'est
// pas affichée est échangée avec le serveur, base locale ouverte, puis refermée avec son ouverture.
// Rien n'est retenu d'une passe à l'autre que les documents eux-mêmes : une passe interrompue est
// reprise en entier. Au plus quatre documents à la fois, et jamais plus de la fraction donnée du
// débit publié ; aucun éditeur ni aucune liaison n'est créé sur un document traité.
import type { HocuspocusProviderWebsocket } from "@hocuspocus/provider";
import * as Y from "yjs";

import { ouvrirLaBase, type Persistance } from "./stockage.ts";
import type { Horloge } from "./environnement.ts";
import { correspondance } from "./noms.ts";
import { type IssueDOuverture, ouvrir, type Ouverture } from "./ouverture.ts";

export const DOCUMENTS_A_LA_FOIS = 4;
/** Messages qu'un document coûte à la passe : authentification, deux pas, fermeture. */
const COUT_D_UN_DOCUMENT = 4;
const ATTENTE_DU_DEBIT_MS = 1000;
/** Au-delà, la page est rendue sans attendre davantage que sa base ait écrit l'état du serveur. */
const ATTENTE_D_ECRITURE_MS = 10_000;

/** Ce que la passe fait d'une ouverture refusée ou fermée par le serveur. */
export type Suite = "reprendre" | "abandonner";

export interface IssueDUnePage {
  readonly idPage: string;
  /** `undefined` : la page est échangée. */
  readonly motif: string | undefined;
  readonly divergente: boolean;
}

export interface OptionsDeLaPasse {
  readonly idEspace: string;
  readonly prise: HocuspocusProviderWebsocket;
  readonly horloge: Horloge;
  /** Documents traités à la fois ; quatre par défaut, un après une fermeture 1009 (AC28). */
  readonly parallelisme?: number | undefined;
  /** Messages que la passe peut encore émettre dans la fenêtre du débit. */
  readonly messagesPermis: () => number;
  /** Décide de la suite d'une page refusée ou fermée par le serveur, sur son motif. */
  readonly surMotif: (idPage: string, motif: string, refus: boolean) => Suite;
  readonly surPage: (issue: IssueDUnePage) => void;
  readonly surFin: () => void;
}

export interface Passe {
  /** Ajoute des pages à la passe en cours (page reçue d'un autre appareil). */
  ajouter(idPages: readonly string[]): void;
  /** Ferme le document d'une page sans attendre (suppression définitive reçue). */
  oublier(idPages: readonly string[]): void;
  /** Arrête la passe ; ses documents sont refermés. */
  arreter(): void;
  estAchevee(): boolean;
  /** Les pages dont le document est ouvert par la passe. */
  enCours(): readonly string[];
}

interface EnCours {
  readonly doc: Y.Doc;
  readonly persistance: Persistance;
  ouverture: Ouverture | undefined;
  attendLEcriture: boolean;
  readonly arrets: (() => void)[];
}

export function lancerLaPasse(options: OptionsDeLaPasse, idPages: readonly string[]): Passe {
  return new PasseDeFond(options, idPages);
}

class PasseDeFond implements Passe {
  readonly #options: OptionsDeLaPasse;
  readonly #aFaire: string[] = [];
  readonly #enCours = new Map<string, EnCours>();
  #arretee = false;
  #achevee = false;
  #attente: (() => void) | undefined;

  // La passe commence après l'appel qui la lance : sa fin, même immédiate, n'est jamais annoncée
  // pendant que l'orchestre la construit encore.
  constructor(options: OptionsDeLaPasse, idPages: readonly string[]) {
    this.#options = options;
    queueMicrotask(() => {
      if (!this.#arretee) {
        this.ajouter(idPages);
      }
    });
  }

  readonly estAchevee = (): boolean => this.#achevee;

  readonly enCours = (): readonly string[] => [...this.#enCours.keys()];

  readonly ajouter = (idPages: readonly string[]): void => {
    for (const idPage of idPages) {
      if (!this.#aFaire.includes(idPage) && !this.#enCours.has(idPage)) {
        this.#aFaire.push(idPage);
      }
    }
    this.#achevee = false;
    this.#avancer();
  };

  readonly oublier = (idPages: readonly string[]): void => {
    for (const idPage of idPages) {
      const index = this.#aFaire.indexOf(idPage);
      if (index >= 0) {
        this.#aFaire.splice(index, 1);
      }
      this.#terminer(idPage);
    }
    this.#avancer();
  };

  readonly arreter = (): void => {
    this.#arretee = true;
    this.#attente?.();
    this.#aFaire.length = 0;
    [...this.#enCours.keys()].forEach((idPage) => this.#terminer(idPage));
  };

  #avancer(): void {
    if (this.#arretee || this.#attente !== undefined) {
      return;
    }
    while (this.#peutCommencer()) {
      if (this.#options.messagesPermis() < COUT_D_UN_DOCUMENT) {
        this.#attendreLeDebit();
        return;
      }
      const idPage = this.#aFaire.shift();
      if (idPage !== undefined) {
        this.#commencer(idPage);
      }
    }
    if (this.#aFaire.length === 0 && this.#enCours.size === 0 && !this.#achevee) {
      this.#achevee = true;
      this.#options.surFin();
    }
  }

  #peutCommencer(): boolean {
    const plafond = this.#options.parallelisme ?? DOCUMENTS_A_LA_FOIS;
    return this.#aFaire.length > 0 && this.#enCours.size < plafond;
  }

  #attendreLeDebit(): void {
    this.#attente = this.#options.horloge.programmer(() => {
      this.#attente = undefined;
      this.#avancer();
    }, ATTENTE_DU_DEBIT_MS);
  }

  #commencer(idPage: string): void {
    let nom: string;
    let persistance: Persistance;
    const doc = new Y.Doc();
    try {
      const lien = correspondance("page", this.#options.idEspace, idPage);
      nom = lien.nomDeDocument;
      persistance = ouvrirLaBase(doc, lien.designation);
    } catch {
      doc.destroy();
      return;
    }
    const enCours: EnCours = {
      doc,
      persistance,
      ouverture: undefined,
      attendLEcriture: false,
      arrets: [],
    };
    this.#enCours.set(idPage, enCours);
    // Pas d'échange avant la fin de la relecture locale, ou de son échec (H14).
    this.#quand(
      enCours,
      persistance.abonner,
      () => persistance.lireEtat() !== "relecture",
      () => {
        enCours.ouverture = ouvrir({
          prise: this.#options.prise,
          horloge: this.#options.horloge,
          nom,
          doc,
          surChangement: () => this.#surOuverture(idPage, enCours),
        });
      },
    );
  }

  #surOuverture(idPage: string, enCours: EnCours): void {
    const ouverture = enCours.ouverture;
    if (ouverture === undefined || this.#enCours.get(idPage) !== enCours) {
      return;
    }
    const issue = ouverture.issue();
    if (issue.sorte === "fermee-par-le-serveur") {
      this.#surFermeture(idPage, issue);
    } else if (issue.sorte === "acquise" && !ouverture.aDesModificationsEnAttente()) {
      this.#quandEcrite(idPage, enCours, ouverture.estDivergente());
    }
  }

  #surFermeture(
    idPage: string,
    issue: Extract<IssueDOuverture, { sorte: "fermee-par-le-serveur" }>,
  ): void {
    this.#terminer(idPage);
    const suite = this.#options.surMotif(idPage, issue.motif, issue.refus);
    if (suite === "reprendre" && !this.#arretee) {
      this.#aFaire.push(idPage);
    } else {
      this.#options.surPage({ idPage, motif: issue.motif, divergente: false });
    }
    this.#avancer();
  }

  // L'état reçu du serveur est écrit dans la base avant que le document ne soit refermé, pour que
  // la page soit lisible hors ligne ; une base coupée ne retient pas la passe (F-013-AC4).
  #quandEcrite(idPage: string, enCours: EnCours, divergente: boolean): void {
    if (enCours.attendLEcriture) {
      return;
    }
    enCours.attendLEcriture = true;
    const { persistance } = enCours;
    const finir = (): void => {
      if (this.#enCours.get(idPage) === enCours) {
        this.#terminer(idPage);
        this.#options.surPage({ idPage, motif: undefined, divergente });
        this.#avancer();
      }
    };
    enCours.arrets.push(this.#options.horloge.programmer(finir, ATTENTE_D_ECRITURE_MS));
    this.#quand(
      enCours,
      persistance.abonner,
      () => persistance.lireEtat() !== "active" || !persistance.aDesModificationsNonEnregistrees(),
      finir,
    );
  }

  #quand(
    enCours: EnCours,
    abonner: (rappel: () => void) => () => void,
    condition: () => boolean,
    suite: () => void,
  ): void {
    let faite = false;
    const verifier = (): void => {
      if (!faite && condition()) {
        faite = true;
        suite();
      }
    };
    enCours.arrets.push(abonner(verifier));
    verifier();
  }

  #terminer(idPage: string): void {
    const enCours = this.#enCours.get(idPage);
    if (enCours === undefined) {
      return;
    }
    this.#enCours.delete(idPage);
    enCours.arrets.splice(0).forEach((arreter) => arreter());
    enCours.ouverture?.fermer();
    enCours.persistance.fermer();
    enCours.doc.destroy();
  }
}
