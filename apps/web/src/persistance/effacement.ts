// Effacement d'une base de page (F-007-AC11, AC21, AC26, H16) : le module appelle lui-même
// `indexedDB.deleteDatabase` et écoute `success`, `error` et `blocked`, sous une échéance. Ni
// `clearData()` ni `clearDocument()` de la bibliothèque : la première se résout avant la fin de la
// suppression, et aucune des deux n'écoute `blocked`.
import { type DesignationDocument, nomDeBase } from "./nom-de-base.ts";

/** `effacee` : la base est absente de l'appareil ; `echec` : elle peut y être encore. */
export type IssueDEffacement = "effacee" | "echec";

export interface DesignationDeBaseDePage {
  readonly idEspace: string;
  readonly idPage: string;
}

/** Même échéance que pour une tentative d'ouverture (F-002-AC24, F-007-AC21). */
const ECHEANCE_D_UN_EFFACEMENT_MS = 10_000;

/**
 * Efface la base de la page de cet espace, et aucune autre : son nom vient de la fonction de
 * nommage du module (F-002-AC25). La promesse n'est jamais rejetée. Elle rend `effacee` sur
 * l'événement `success`, seul à prouver que la base n'existe plus, une base absente comprise. Une
 * demande bloquée par une autre connexion est attendue jusqu'à l'échéance : le navigateur l'exécute
 * dès que cette connexion se ferme. L'échéance passée, l'issue est `echec`, même si la base finit
 * par disparaître. Un identifiant que la fonction de nommage refuse ne désigne aucune base que ce
 * module ait pu créer : il n'y a rien à effacer.
 */
export function effacerBaseDePage(designation: DesignationDeBaseDePage): Promise<IssueDEffacement> {
  let nom: string;
  try {
    nom = nomDeBase({ type: "page", idEspace: designation.idEspace, idPage: designation.idPage });
  } catch {
    return Promise.resolve("effacee");
  }
  return supprimer(nom);
}

/**
 * Efface la base du document désigné, et aucune autre (F-013-AC24 : base du document d'espace),
 * dans les mêmes conditions que `effacerBaseDePage`.
 */
export function effacerBaseDeDocument(designation: DesignationDocument): Promise<IssueDEffacement> {
  let nom: string;
  try {
    nom = nomDeBase(designation);
  } catch {
    return Promise.resolve("effacee");
  }
  return supprimer(nom);
}

function supprimer(nom: string): Promise<IssueDEffacement> {
  return new Promise((resoudre) => {
    let conclu = false;
    const conclure = (issue: IssueDEffacement): void => {
      if (!conclu) {
        conclu = true;
        clearTimeout(echeance);
        resoudre(issue);
      }
    };
    const echeance = setTimeout(() => conclure("echec"), ECHEANCE_D_UN_EFFACEMENT_MS);
    let demande: IDBOpenDBRequest;
    try {
      demande = indexedDB.deleteDatabase(nom);
    } catch {
      conclure("echec");
      return;
    }
    demande.onsuccess = () => conclure("effacee");
    // L'erreur est traitée ici : elle ne remonte ni à la fenêtre ni en rejet non géré.
    demande.onerror = (evenement) => {
      evenement.preventDefault();
      conclure("echec");
    };
    demande.onblocked = () => undefined;
  });
}
