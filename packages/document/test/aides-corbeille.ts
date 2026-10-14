// Aide suivie des tests de F-007 (F-002-AC31) : chaque façade qu'elle ouvre est fermée par
// `fermerLesSuivies`, qui rend le nombre d'écouteurs restés sur les documents après cela.
import * as Y from "yjs";

import { creerDocumentEspace, type DocumentEspace, ouvrirDocumentEspace } from "../src/index.ts";

const departs = new Map<Y.Doc, number>();
const suivies: DocumentEspace[] = [];

function ecouteurs(doc: Y.Doc): number {
  return doc._observers.get("afterTransaction")?.size ?? 0;
}

function suivre(espace: DocumentEspace, depart: number): DocumentEspace {
  if (!departs.has(espace.doc)) {
    departs.set(espace.doc, depart);
  }
  suivies.push(espace);
  return espace;
}

export function creerSuivie(): DocumentEspace {
  const depart = ecouteurs(new Y.Doc());
  return suivre(creerDocumentEspace(), depart);
}

export function ouvrirSuivie(doc: Y.Doc): DocumentEspace {
  const depart = ecouteurs(doc);
  return suivre(ouvrirDocumentEspace(doc), depart);
}

/** Ferme toutes les façades suivies ; rend le nombre d'écouteurs restés en plus du départ. */
export function fermerLesSuivies(): number {
  suivies.splice(0).forEach((espace) => espace.fermer());
  let restes = 0;
  for (const [doc, depart] of departs) {
    restes += Math.max(0, ecouteurs(doc) - depart);
  }
  departs.clear();
  return restes;
}
