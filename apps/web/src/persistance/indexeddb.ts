import { IndexeddbPersistence } from "y-indexeddb";
import type * as Y from "yjs";

import { type DesignationDocument, nomDeBase } from "./nom-de-base.ts";

export const DELAI_RELECTURE_MS = 10_000;

export type EtatPersistance = "relecture" | "active" | "coupee" | "fermee";

export interface Persistance {
  etat(): EtatPersistance;
  abonner(rappel: () => void): () => void;
  fermer(): void;
}

/** Ce qu'une étape d'ouverture reçoit pour avancer sous l'échéance commune. */
export interface Ouverture {
  attendue(): boolean;
  couper(): void;
  relire(nomDeLaBase: string): void;
}

export function ouvrirPersistance(doc: Y.Doc, designation: DesignationDocument): Persistance {
  const nom = nomDeBase(designation);
  return ouvrirSousEcheance(doc, (ouverture) => ouverture.relire(nom));
}

export function ouvrirSousEcheance(
  doc: Y.Doc,
  commencer: (ouverture: Ouverture) => void,
): Persistance {
  const suivi = new SuiviDeLEtat();
  const couper = (): void => suivi.passerA("coupee");
  if (typeof indexedDB === "undefined") {
    couper();
  } else {
    suivi.armerLEcheance();
    commencer({
      attendue: () => suivi.etat() === "relecture",
      couper,
      relire: (nomDeLaBase) => relire(doc, nomDeLaBase, suivi),
    });
  }
  return { etat: suivi.etat, abonner: suivi.abonner, fermer: () => suivi.passerA("fermee") };
}

class SuiviDeLEtat {
  #etat: EtatPersistance = "relecture";
  #echeance: ReturnType<typeof setTimeout> | undefined;
  readonly #abonnes = new Set<() => void>();
  readonly #arrets: (() => void)[] = [];

  readonly etat = (): EtatPersistance => this.#etat;

  readonly abonner = (rappel: () => void): (() => void) => {
    const notifier = (): void => rappel();
    this.#abonnes.add(notifier);
    return () => void this.#abonnes.delete(notifier);
  };

  armerLEcheance(): void {
    this.#echeance = setTimeout(() => this.passerA("coupee"), DELAI_RELECTURE_MS);
  }

  aLArret(arreter: () => void): void {
    this.#arrets.push(arreter);
  }

  // « coupee » et « fermee » sont définitifs jusqu'au rechargement (ADR-0008).
  passerA(suivant: Exclude<EtatPersistance, "relecture">): void {
    if (this.#etat === "coupee" || this.#etat === "fermee" || this.#etat === suivant) {
      return;
    }
    this.#etat = suivant;
    clearTimeout(this.#echeance);
    if (suivant !== "active") {
      this.#arrets.splice(0).forEach((arreter) => arreter());
    }
    [...this.#abonnes].forEach((notifier) => notifier());
  }
}

function relire(doc: Y.Doc, nomDeLaBase: string, suivi: SuiviDeLEtat): void {
  if (suivi.etat() !== "relecture") {
    return;
  }
  sonder(nomDeLaBase, (ouvrable) => {
    if (!ouvrable) {
      suivi.passerA("coupee");
    } else if (suivi.etat() === "relecture") {
      brancherLaBibliotheque(doc, nomDeLaBase, suivi);
    }
  });
}

// y-indexeddb ne laisse attacher aucun traitement à l'échec de sa propre ouverture : il devient un
// rejet non géré. La base est donc ouverte une première fois ici, sous nos gestionnaires ; si elle
// n'existe pas, sa création est annulée, ce qui la laisse absente.
function sonder(nomDeLaBase: string, conclure: (ouvrable: boolean) => void): void {
  let demande: IDBOpenDBRequest;
  try {
    demande = indexedDB.open(nomDeLaBase);
  } catch {
    conclure(false);
    return;
  }
  let creationAnnulee = false;
  demande.onupgradeneeded = () => {
    creationAnnulee = true;
    demande.transaction?.abort();
  };
  demande.onsuccess = () => {
    demande.result.close();
    conclure(true);
  };
  demande.onerror = (evenement) => {
    evenement.preventDefault();
    conclure(creationAnnulee);
  };
}

function brancherLaBibliotheque(doc: Y.Doc, nomDeLaBase: string, suivi: SuiviDeLEtat): void {
  const bibliotheque = new IndexeddbPersistence(nomDeLaBase, doc);
  const couper = (): void => suivi.passerA("coupee");
  // destroy() désabonne la bibliothèque du document et lève son drapeau de destruction : elle
  // n'applique ni n'écrit plus rien, même si sa base s'ouvre plus tard. Sa promesse rejette quand
  // l'ouverture a échoué : le rejet est absorbé ici, l'échec étant déjà traduit en « coupee ».
  suivi.aLArret(() => void bibliotheque.destroy().catch(() => undefined));
  bibliotheque.once("synced", () => suivi.passerA("active"));
  bibliotheque._db.then((connexion) => {
    garder(connexion, couper);
    // Une persistance déjà coupée ou fermée a désabonné la bibliothèque : on ne la rebranche pas.
    if (suivi.etat() === "relecture") {
      validerChaqueEcriture(bibliotheque, connexion);
    }
  }, couper);
}

// y-indexeddb écrit chaque mise à jour dans une transaction qu'elle laisse le navigateur valider
// seul, un aller-retour plus tard : un rechargement lancé entre-temps annule la transaction et la
// dernière écriture est perdue (une fois sur quatre dans Chromium). Son écriture est donc
// enveloppée : la transaction qu'elle ouvre pendant cet appel synchrone, et elle seule, est
// validée par `commit()` dès que la demande d'ajout est posée. La relecture et le compactage
// ouvrent les leurs hors de cet appel et gardent la validation automatique, dont leurs étapes
// successives ont besoin. `destroy()` désabonne le champ `_storeUpdate`, donc l'enveloppe.
function validerChaqueEcriture(bibliotheque: IndexeddbPersistence, connexion: IDBDatabase): void {
  const ecrire = bibliotheque._storeUpdate;
  const ouvrir = connexion.transaction.bind(connexion);
  const ecrireEtValider = (miseAJour: Uint8Array, origine: unknown): void => {
    const ouvertes: IDBTransaction[] = [];
    connexion.transaction = (magasins, mode, options) => {
      const transaction = ouvrir(magasins, mode, options);
      ouvertes.push(transaction);
      return transaction;
    };
    try {
      ecrire(miseAJour, origine);
    } finally {
      Reflect.deleteProperty(connexion, "transaction");
    }
    ouvertes.forEach(valider);
  };
  bibliotheque.doc.off("update", ecrire);
  bibliotheque._storeUpdate = ecrireEtValider;
  bibliotheque.doc.on("update", ecrireEtValider);
}

// `commit()` manque aux navigateurs anciens : la validation automatique reste alors la seule. Il
// lève quand le moteur a déjà terminé la transaction (Chromium, valeur trop grande pour lui) : son
// annulation arrive alors par l'écouteur `abort` de la connexion, et rien ne doit s'échapper dans
// la frappe qui a produit la mise à jour.
function valider(transaction: IDBTransaction): void {
  if (typeof transaction.commit !== "function") {
    return;
  }
  try {
    transaction.commit();
  } catch {
    return;
  }
}

// y-indexeddb transforme l'erreur d'une demande de lecture ou d'écriture en rejet que personne ne
// peut attacher. L'écouteur en phase de capture arrête l'événement avant la demande : la promesse
// de la bibliothèque ne se règle jamais, aucun rejet n'est émis. `abort` couvre une transaction
// annulée sans demande en erreur (quota), `close` une fermeture anormale de la connexion.
function garder(connexion: IDBDatabase, couper: () => void): void {
  const enCapture = true;
  connexion.addEventListener(
    "error",
    (evenement) => {
      evenement.stopPropagation();
      couper();
    },
    enCapture,
  );
  connexion.addEventListener("abort", couper);
  connexion.addEventListener("close", couper);
}
