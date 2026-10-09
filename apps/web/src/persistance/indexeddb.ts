import { IndexeddbPersistence } from "y-indexeddb";
import * as Y from "yjs";

import { lireLaBase, porteTout, temoinDe } from "./lecture-brute.ts";
import { type DesignationDocument, nomDeBase } from "./nom-de-base.ts";
import { type EtatPersistance, Suivi, type Tentative } from "./suivi.ts";

const MAGASIN_DES_MISES_A_JOUR = "updates";

export interface Persistance {
  lireEtat(): EtatPersistance;
  abonner(rappel: () => void): () => void;
  /** Définitif : plus aucune tentative, plus rien d'écrit. */
  fermer(): void;
  /** Lance aussitôt une tentative de reprise si la persistance est coupée (F-030-AC2). */
  reessayer(): void;
}

/** Ce qu'une étape d'une tentative reçoit pour avancer sous l'échéance commune. */
export interface Ouverture {
  attendue(): boolean;
  couper(): void;
  relire(nomDeLaBase: string): void;
}

export function ouvrirPersistance(doc: Y.Doc, designation: DesignationDocument): Persistance {
  const nom = nomDeBase(designation);
  return ouvrirSousEcheance(doc, (ouverture) => ouverture.relire(nom));
}

// `commencer` est rappelé à chaque tentative : rien n'est retenu de l'issue des précédentes
// (F-030-AC3). `indexedDB` absent se retente comme le reste : chaque demande d'ouverture du module
// est faite sous garde, et l'absence de la globale y est une ouverture refusée parmi d'autres.
export function ouvrirSousEcheance(
  doc: Y.Doc,
  commencer: (ouverture: Ouverture) => void,
): Persistance {
  const suivi = new Suivi((tentative) =>
    commencer({
      attendue: tentative.attendue,
      couper: tentative.echouer,
      relire: (nomDeLaBase) => relire(doc, nomDeLaBase, tentative),
    }),
  );
  suivi.lancer();
  return {
    lireEtat: suivi.lireEtat,
    abonner: suivi.abonner,
    fermer: suivi.fermer,
    reessayer: suivi.reessayer,
  };
}

function relire(doc: Y.Doc, nomDeLaBase: string, tentative: Tentative): void {
  if (!tentative.attendue()) {
    return;
  }
  // y-indexeddb ne laisse attacher aucun traitement à l'échec de sa propre ouverture : il devient
  // un rejet non géré. La base est donc d'abord lue ici, sous nos gestionnaires, sans rien écrire.
  const abandonner = lireLaBase(nomDeLaBase, (lecture) => {
    if (lecture.issue === "echec" || lecture.issue === "sans-magasin") {
      tentative.echouer();
    } else if (tentative.attendue()) {
      brancherLaBibliotheque(doc, nomDeLaBase, tentative);
    }
  });
  tentative.aLArret(abandonner);
}

// Une instance neuve à chaque tentative, sur le document resté en mémoire : elle écrit son état
// complet dans la base, puis lui applique ce qu'elle y a lu (fusion, F-030-AC4).
function brancherLaBibliotheque(doc: Y.Doc, nomDeLaBase: string, tentative: Tentative): void {
  const bibliotheque = new IndexeddbPersistence(nomDeLaBase, doc);
  // destroy() désabonne la bibliothèque du document et lève son drapeau de destruction : elle
  // n'applique ni n'écrit plus rien, même si sa base s'ouvre plus tard. Sa promesse rejette quand
  // l'ouverture a échoué : le rejet est absorbé ici, l'échec étant déjà traduit en coupure.
  tentative.aLArret(() => void bibliotheque.destroy().catch(() => undefined));
  // `synced` ne prouve pas l'écriture : la bibliothèque l'émet sans attendre que l'ajout de l'état
  // complet soit validé, donc même quand il échoue (F-030-AC26).
  bibliotheque.once("synced", () => prouverLEcriture(bibliotheque, nomDeLaBase, tentative));
  bibliotheque._db.then((connexion) => {
    garder(connexion, tentative.echouer);
    // Une tentative abandonnée a désabonné la bibliothèque : on ne la rebranche pas.
    if (tentative.attendue()) {
      validerChaqueEcriture(bibliotheque, connexion, tentative.echouer);
    }
  }, tentative.echouer);
}

// Preuve d'écriture (F-030-AC26). L'état retenu est celui que le document porte quand la
// bibliothèque finit de lui appliquer l'état relu : ce qui est modifié ensuite est écrit par
// l'instance et n'entre pas dans la comparaison. La première moitié de la preuve est tenue par
// `garder` : un événement `error`, `abort` ou `close` de la connexion a déjà fait échouer la
// tentative.
function prouverLEcriture(
  bibliotheque: IndexeddbPersistence,
  nomDeLaBase: string,
  tentative: Tentative,
): void {
  const connexion = bibliotheque.db;
  if (connexion === null || !tentative.attendue()) {
    return;
  }
  const etatEnMemoire = Y.encodeStateAsUpdate(bibliotheque.doc);
  apresLesEcrituresEnCours(connexion, (ordonnee) => {
    if (!ordonnee) {
      tentative.echouer();
      return;
    }
    const abandonner = lireLaBase(nomDeLaBase, (lecture) => {
      const temoin = lecture.issue === "lue" ? temoinDe(lecture.enregistrements) : undefined;
      const prouvee = temoin !== undefined && porteTout(temoin, etatEnMemoire);
      temoin?.destroy();
      if (prouvee) {
        tentative.aboutir();
      } else {
        tentative.echouer();
      }
    });
    tentative.aLArret(abandonner);
  });
}

// Transaction de barrière : elle ne finit qu'après les écritures déjà demandées sur le magasin,
// dont celle de l'état complet. Elle ne prouve rien d'autre que l'ordre : elle finit sans erreur
// même quand cette écriture a été annulée (F-030 H13).
function apresLesEcrituresEnCours(
  connexion: IDBDatabase,
  poursuivre: (ordonnee: boolean) => void,
): void {
  let barriere: IDBTransaction;
  try {
    barriere = connexion.transaction(MAGASIN_DES_MISES_A_JOUR, "readonly");
    barriere.objectStore(MAGASIN_DES_MISES_A_JOUR).count();
  } catch {
    poursuivre(false);
    return;
  }
  barriere.oncomplete = () => poursuivre(true);
}

// y-indexeddb écrit chaque mise à jour dans une transaction qu'elle laisse le navigateur valider
// seul, un aller-retour plus tard : un rechargement lancé entre-temps annule la transaction et la
// dernière écriture est perdue (une fois sur quatre dans Chromium). Son écriture est donc
// enveloppée : la transaction qu'elle ouvre pendant cet appel synchrone, et elle seule, est
// validée par `commit()` dès que la demande d'ajout est posée. La relecture et le compactage
// ouvrent les leurs hors de cet appel et gardent la validation automatique, dont leurs étapes
// successives ont besoin. `destroy()` désabonne le champ `_storeUpdate`, donc l'enveloppe.
// Une exception de l'écriture (connexion fermée sans événement) n'atteint pas l'appelant de la
// modification : c'est une panne, donc une coupure (F-030-AC18).
function validerChaqueEcriture(
  bibliotheque: IndexeddbPersistence,
  connexion: IDBDatabase,
  surPanne: () => void,
): void {
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
    } catch {
      surPanne();
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
// annulée sans demande en erreur (quota), `close` une fermeture anormale de la connexion. Tant que
// la tentative court, c'est son échec ; une fois la persistance active, c'est une coupure.
function garder(connexion: IDBDatabase, surPanne: () => void): void {
  const enCapture = true;
  connexion.addEventListener(
    "error",
    (evenement) => {
      evenement.stopPropagation();
      surPanne();
    },
    enCapture,
  );
  connexion.addEventListener("abort", surPanne);
  connexion.addEventListener("close", surPanne);
}
