// Une ouverture d'un document sur la connexion de l'onglet (F-012, « ouverture ») : un fournisseur
// par document, attaché à la WebSocket partagée, sans objet de présence (F-013-AC9), avec un jeton
// constant sans secret (F-013-AC8). Elle n'est acquise qu'à la réception de l'état du document,
// jamais au seul message `authenticated` (F-013-AC18) ; son droit n'est retenu qu'alors.
import {
  HocuspocusProvider,
  type HocuspocusProviderWebsocket,
  WebSocketStatus,
} from "@hocuspocus/provider";
import * as Y from "yjs";

import type { Droit } from "./stockage.ts";
import { octetsDe, vecteurDuPremierPas } from "./protocole.ts";

/** Jeton joint à chaque ouverture : une constante, jamais une valeur tirée du serveur (AC8). */
export const JETON_SANS_SECRET = "notionlike";

const PORTEE_LECTURE_SEULE = "readonly";

export type IssueDOuverture =
  | { readonly sorte: "attente" }
  | { readonly sorte: "acquise"; readonly droit: Droit }
  /** Refusée ou fermée par le serveur : le fournisseur ne la rouvre pas de lui-même (H12). */
  | { readonly sorte: "fermee-par-le-serveur"; readonly motif: string; readonly refus: boolean };

export interface Ouverture {
  readonly nom: string;
  readonly doc: Y.Doc;
  issue(): IssueDOuverture;
  /** Vrai : une modification émise en écriture n'est pas encore acquittée (F-012-AC16). */
  aDesModificationsEnAttente(): boolean;
  /**
   * Vrai : en lecture seule, le document porte des modifications que le serveur n'a pas, d'après
   * le vecteur d'état qu'il annonce dans l'échange de synchronisation (F-013-AC27).
   */
  estDivergente(): boolean;
  /** Vrai si le fournisseur est l'origine de cette transaction (mise à jour reçue du serveur). */
  estSonOrigine(origine: unknown): boolean;
  /**
   * Referme l'ouverture. Si le serveur l'a fermée ou refusée, aucun message de fermeture n'est
   * émis (F-013-AC45) : le fournisseur est d'abord retiré de la table des fournisseurs attachés,
   * option documentée de la WebSocket, puis détruit.
   */
  fermer(): void;
}

export interface OptionsDOuverture {
  readonly prise: HocuspocusProviderWebsocket;
  readonly nom: string;
  readonly doc: Y.Doc;
  readonly surChangement: () => void;
}

export function ouvrir(options: OptionsDOuverture): Ouverture {
  return new OuvertureDeDocument(options);
}

class OuvertureDeDocument implements Ouverture {
  readonly nom: string;
  readonly doc: Y.Doc;
  readonly #prise: HocuspocusProviderWebsocket;
  readonly #fournisseur: HocuspocusProvider;
  readonly #surChangement: () => void;
  #issue: IssueDOuverture = { sorte: "attente" };
  #portee: Droit | undefined;
  #vecteurDuServeur: Uint8Array | undefined;
  #fermee = false;

  constructor({ prise, nom, doc, surChangement }: OptionsDOuverture) {
    this.nom = nom;
    this.doc = doc;
    this.#prise = prise;
    this.#surChangement = surChangement;
    this.#fournisseur = new HocuspocusProvider({
      websocketProvider: prise,
      name: nom,
      document: doc,
      awareness: null,
      token: JETON_SANS_SECRET,
    });
    this.#ecouter();
    this.#fournisseur.attach();
  }

  readonly issue = (): IssueDOuverture => this.#issue;

  readonly aDesModificationsEnAttente = (): boolean =>
    this.#issue.sorte === "acquise" &&
    this.#issue.droit === "ecriture" &&
    this.#fournisseur.unsyncedChanges > 0;

  readonly estDivergente = (): boolean => {
    if (this.#issue.sorte !== "acquise" || this.#issue.droit !== "lecture") {
      return false;
    }
    return (
      this.#vecteurDuServeur !== undefined &&
      porteCeQueLeServeurNaPas(this.doc, this.#vecteurDuServeur)
    );
  };

  readonly estSonOrigine = (origine: unknown): boolean => origine === this.#fournisseur;

  readonly fermer = (): void => {
    if (this.#fermee) {
      return;
    }
    this.#fermee = true;
    const table = this.#prise.configuration.providerMap;
    if (
      this.#issue.sorte === "fermee-par-le-serveur" &&
      table.get(this.nom) === this.#fournisseur
    ) {
      table.delete(this.nom);
    }
    this.#fournisseur.destroy();
  };

  #changer(issue: IssueDOuverture): void {
    if (this.#fermee) {
      return;
    }
    this.#issue = issue;
    this.#surChangement();
  }

  #ecouter(): void {
    const fournisseur = this.#fournisseur;
    fournisseur.on("authenticated", ({ scope }: { scope: string }) => {
      this.#portee = scope === PORTEE_LECTURE_SEULE ? "lecture" : "ecriture";
    });
    fournisseur.on("synced", () => {
      if (this.#portee !== undefined && this.#issue.sorte === "attente") {
        this.#changer({ sorte: "acquise", droit: this.#portee });
      }
    });
    fournisseur.on("authenticationFailed", ({ reason }: { reason: string }) => {
      this.#changer({ sorte: "fermee-par-le-serveur", motif: reason, refus: true });
    });
    // Un message de fermeture d'ouverture arrive, WebSocket ouverte ; la fermeture de la WebSocket
    // elle-même est l'affaire de la connexion, qui défait alors toutes les ouvertures.
    fournisseur.on("close", ({ event }: { event: { reason: string } }) => {
      if (
        this.#prise.status === WebSocketStatus.Connected &&
        this.#issue.sorte !== "fermee-par-le-serveur"
      ) {
        this.#changer({ sorte: "fermee-par-le-serveur", motif: event.reason, refus: false });
      }
    });
    fournisseur.on("unsyncedChanges", () => {
      if (!this.#fermee) {
        this.#surChangement();
      }
    });
    fournisseur.on("message", ({ event }: { event: MessageEvent }) => {
      const octets = octetsDe(event.data);
      const vecteur = octets === undefined ? undefined : vecteurDuPremierPas(octets);
      if (vecteur !== undefined && !this.#fermee) {
        this.#vecteurDuServeur = vecteur;
        this.#surChangement();
      }
    });
  }
}

/** Le document porte-t-il une opération qu'un client du vecteur d'état du serveur n'a pas ? */
export function porteCeQueLeServeurNaPas(doc: Y.Doc, vecteurDuServeur: Uint8Array): boolean {
  let duServeur: Map<number, number>;
  try {
    duServeur = Y.decodeStateVector(vecteurDuServeur);
  } catch {
    return false;
  }
  for (const [client, horloge] of Y.decodeStateVector(Y.encodeStateVector(doc))) {
    if (horloge > (duServeur.get(client) ?? 0)) {
      return true;
    }
  }
  return false;
}
