import type * as Y from "yjs";

import { type Ouverture, ouvrirSousEcheance, type Persistance } from "./indexeddb.ts";
import { nomDeBase } from "./nom-de-base.ts";

// Base de l'appareil : ce n'est pas une base de document (ADR-0008).
const BASE_APPAREIL = "notionlike:appareil";
const VERSION_BASE_APPAREIL = 1;
const MAGASIN_REGLAGES = "reglages";
const CLE_ESPACE_LOCAL = "espace-local";

// L'identifiant retenu n'est pas exposé : rien ne le lit avant F-003 (ADR-0008).
export function ouvrirEspaceLocal(doc: Y.Doc, idCandidat: string): Persistance {
  nomDeLEspace(idCandidat);
  return ouvrirSousEcheance(doc, (ouverture) =>
    lireOuInscrire(idCandidat, ouverture, (idInscrit) => {
      const nom = nomDeLEspaceInscrit(idInscrit);
      if (nom === undefined) {
        ouverture.couper();
      } else {
        ouverture.relire(nom);
      }
    }),
  );
}

function nomDeLEspace(idEspace: string): string {
  return nomDeBase({ type: "espace", idEspace });
}

// Ce que l'appareil a conservé peut être illisible : un nom de base n'en est jamais tiré sans
// repasser par la fonction de nommage (F-002-AC28).
function nomDeLEspaceInscrit(idInscrit: unknown): string | undefined {
  if (typeof idInscrit !== "string") {
    return undefined;
  }
  try {
    return nomDeLEspace(idInscrit);
  } catch {
    return undefined;
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
    let transaction: IDBTransaction;
    try {
      transaction = connexion.transaction(MAGASIN_REGLAGES, "readwrite");
    } catch {
      // Une base de l'appareil sans son magasin est inutilisable : la session reste en mémoire.
      connexion.close();
      ouverture.couper();
      return;
    }
    const reglages = transaction.objectStore(MAGASIN_REGLAGES);
    const lecture = reglages.get(CLE_ESPACE_LOCAL);
    lecture.onsuccess = () => {
      // L'échéance peut tomber entre l'ouverture et cette lecture : rien n'est inscrit après elle
      // (F-002-AC24).
      if (lecture.result === undefined && ouverture.attendue()) {
        reglages.put(idCandidat, CLE_ESPACE_LOCAL);
      }
    };
    transaction.oncomplete = () => {
      connexion.close();
      if (ouverture.attendue()) {
        // Seule l'absence de valeur vaut premier lancement : une valeur nulle est illisible.
        poursuivre(lecture.result === undefined ? idCandidat : lecture.result);
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
