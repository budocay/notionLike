// Relevé de la base d'un document (F-032-AC20, repli sans énumération) : ce que la base porte, lu
// par la lecture brute, sans la bibliothèque et sans écrire un octet, dans un document témoin que
// rien n'affiche ni n'enregistre. Une base absente le reste.
import type * as Y from "yjs";

import { lireLaBase } from "./lecture-brute.ts";
import { type DesignationDocument, nomDeBase } from "./nom-de-base.ts";
import { temoinDe } from "./temoin.ts";

/** Même échéance qu'une tentative d'ouverture (F-002-AC24). */
const ECHEANCE_D_UN_RELEVE_MS = 10_000;

/**
 * Le témoin de ce que porte la base du document ; `undefined` si elle est absente, illisible, ou
 * si sa lecture n'aboutit pas en 10 secondes. Jamais rejetée. Le témoin est à détruire par qui le
 * reçoit.
 */
export function releverLaBase(designation: DesignationDocument): Promise<Y.Doc | undefined> {
  let nom: string;
  try {
    nom = nomDeBase(designation);
  } catch {
    return Promise.resolve(undefined);
  }
  return new Promise((resoudre) => {
    let abandonner = (): void => undefined;
    const echeance = setTimeout(() => {
      abandonner();
      resoudre(undefined);
    }, ECHEANCE_D_UN_RELEVE_MS);
    abandonner = lireLaBase(nom, (lecture) => {
      clearTimeout(echeance);
      resoudre(lecture.issue === "lue" ? temoinDe(lecture.enregistrements) : undefined);
    });
  });
}
