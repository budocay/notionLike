// Seul fichier de test du paquet qui ouvre une façade de document de page (F-003-AC35). Chaque
// façade ouverte ici est suivie et fermée en fin de test, et la preuve de la fermeture est le
// nombre d'écouteurs et d'observateurs de chaque `Y.Doc` revenu à sa valeur de départ.
import { afterEach, expect } from "vitest";
import * as Y from "yjs";

import { type DocumentPage, ErreurDocument, ouvrirDocumentPage } from "../src/index.ts";

const departs = new Map<Y.Doc, number>();
const pagesSuivies: DocumentPage[] = [];
const arrets: (() => void)[] = [];

/** Écouteurs du document et observateurs, simples et profonds, de chacun de ses types racine. */
export function observateursDe(doc: Y.Doc): number {
  let compte = 0;
  doc._observers.forEach((ecouteurs) => {
    compte += ecouteurs.size;
  });
  doc.share.forEach((type) => {
    compte += type._eH.l.length + type._dEH.l.length;
  });
  return compte;
}

// Le départ d'un document est son compte avant tout ce que ce fichier y pose.
function noterLeDepart(doc: Y.Doc): void {
  if (!departs.has(doc)) {
    departs.set(doc, observateursDe(doc));
  }
}

export function ouvrirPageSuivie(doc: Y.Doc): DocumentPage {
  noterLeDepart(doc);
  const page = ouvrirDocumentPage(doc);
  pagesSuivies.push(page);
  return page;
}

/** Nombre de paramètres déclarés par la fonction d'ouverture de la façade (F-003-AC34). */
export function nombreDeParametresDeLOuverture(): number {
  return ouvrirDocumentPage.length;
}

/** Observateurs que le document porte en plus de son compte à la première ouverture suivie. */
export function observateursAjoutes(doc: Y.Doc): number {
  return observateursDe(doc) - (departs.get(doc) ?? 0);
}

/** Mises à jour émises par le document à partir de maintenant ; l'écoute cesse en fin de test. */
export function misesAJourDe(doc: Y.Doc): Uint8Array[] {
  noterLeDepart(doc);
  const emises: Uint8Array[] = [];
  const noter = (miseAJour: Uint8Array): void => void emises.push(miseAJour);
  doc.on("update", noter);
  arrets.push(() => doc.off("update", noter));
  return emises;
}

/** Code de l'erreur typée levée par l'opération ; `undefined` si elle ne lève pas. */
export function codeDuRefusDe(operation: () => unknown): string | undefined {
  try {
    operation();
    return undefined;
  } catch (erreur) {
    return erreur instanceof ErreurDocument ? erreur.code : `autre erreur : ${String(erreur)}`;
  }
}

/** Une réplique à l'identifiant de client fixé : Yjs s'en sert pour départager deux écritures. */
export function docDuClient(identifiantDeClient: number): Y.Doc {
  const doc = new Y.Doc();
  doc.clientID = identifiantDeClient;
  return doc;
}

/** Ce que `source` porte et que `destinataire` n'a pas, livré comme une mise à jour reçue. */
export function livrerLEtat(destinataire: Y.Doc, source: Y.Doc): void {
  Y.applyUpdate(destinataire, Y.encodeStateAsUpdate(source, Y.encodeStateVector(destinataire)));
}

/**
 * Élève la version d'un document comme le ferait une autre réplique, puis la livre : la façade
 * ouverte sur `doc` la reçoit par `Y.applyUpdate`.
 */
export function recevoirLaVersion(doc: Y.Doc, version: number): void {
  const emettrice = new Y.Doc();
  const facade = ouvrirDocumentPage(emettrice);
  facade.eleverVersion(version);
  facade.fermer();
  Y.applyUpdate(doc, Y.encodeStateAsUpdate(emettrice));
}

afterEach(() => {
  arrets.splice(0).forEach((arreter) => arreter());
  pagesSuivies.splice(0).forEach((page) => page.fermer());
  const ajoutes = [...departs.keys()].map(observateursAjoutes);
  departs.clear();
  expect(ajoutes).toEqual(ajoutes.map(() => 0));
});
