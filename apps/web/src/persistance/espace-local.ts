import type * as Y from "yjs";

import { type Ouverture, ouvrirSousEcheance, type Persistance } from "./indexeddb.ts";
import { nomDeBase } from "./nom-de-base.ts";

// Base de l'appareil : ce n'est pas une base de document (ADR-0008).
const BASE_APPAREIL = "notionlike:appareil";
const VERSION_BASE_APPAREIL = 1;
const MAGASIN_REGLAGES = "reglages";
const CLE_ESPACE_LOCAL = "espace-local";

export interface PersistanceEspaceLocal extends Persistance {
  /** Le candidat tant que l'identifiant inscrit sur l'appareil n'est pas connu. */
  idEspace(): string;
}

export function ouvrirEspaceLocal(doc: Y.Doc, idCandidat: string): PersistanceEspaceLocal {
  nomDeLEspace(idCandidat);
  let idEspace = idCandidat;
  const persistance = ouvrirSousEcheance(doc, (ouverture) =>
    lireOuInscrire(idCandidat, ouverture, (idInscrit) => {
      if (estIdentifiantDEspace(idInscrit)) {
        idEspace = idInscrit;
        ouverture.relire(nomDeLEspace(idInscrit));
      } else {
        ouverture.couper();
      }
    }),
  );
  return { ...persistance, idEspace: () => idEspace };
}

function nomDeLEspace(idEspace: string): string {
  return nomDeBase({ type: "espace", idEspace });
}

// Ce que l'appareil a conservé peut être illisible : un nom de base n'en est jamais tiré sans contrôle.
function estIdentifiantDEspace(valeur: unknown): valeur is string {
  if (typeof valeur !== "string") {
    return false;
  }
  try {
    nomDeLEspace(valeur);
    return true;
  } catch {
    return false;
  }
}

// Lecture et inscription dans une seule transaction en écriture : IndexedDB sérialise celles d'un
// même magasin, deux onglets lancés ensemble retiennent donc le même identifiant (F-002-AC4).
function lireOuInscrire(
  idCandidat: string,
  ouverture: Ouverture,
  poursuivre: (idInscrit: unknown) => void,
): void {
  ouvrirLaBaseDeLAppareil(ouverture, (connexion) => {
    const transaction = connexion.transaction(MAGASIN_REGLAGES, "readwrite");
    const reglages = transaction.objectStore(MAGASIN_REGLAGES);
    const lecture = reglages.get(CLE_ESPACE_LOCAL);
    lecture.onsuccess = () => {
      if (lecture.result === undefined) {
        reglages.put(idCandidat, CLE_ESPACE_LOCAL);
      }
    };
    transaction.oncomplete = () => {
      connexion.close();
      if (ouverture.attendue()) {
        poursuivre(lecture.result ?? idCandidat);
      }
    };
    transaction.onabort = () => {
      connexion.close();
      ouverture.couper();
    };
  });
}

function ouvrirLaBaseDeLAppareil(
  ouverture: Ouverture,
  poursuivre: (connexion: IDBDatabase) => void,
): void {
  let demande: IDBOpenDBRequest;
  try {
    demande = indexedDB.open(BASE_APPAREIL, VERSION_BASE_APPAREIL);
  } catch {
    ouverture.couper();
    return;
  }
  // Après l'échéance, une réponse tardive ne doit plus rien lire ni écrire (F-002-AC24).
  demande.onupgradeneeded = () => {
    if (ouverture.attendue()) {
      demande.result.createObjectStore(MAGASIN_REGLAGES);
    } else {
      demande.transaction?.abort();
    }
  };
  demande.onsuccess = () => {
    if (ouverture.attendue()) {
      poursuivre(demande.result);
    } else {
      demande.result.close();
    }
  };
  demande.onerror = (evenement) => {
    evenement.preventDefault();
    ouverture.couper();
  };
}
