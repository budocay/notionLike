// Seul fichier de test d'apps/web qui ouvre une façade de document d'espace (F-002-AC31). Chaque
// façade ouverte ici est suivie : `preparation.ts` les ferme en fin de test et exige que chaque
// `Y.Doc` ait retrouvé son nombre d'écouteurs de départ.
import {
  creerDocumentEspace,
  type DocumentEspace,
  ouvrirDocumentEspace,
} from "@notionlike/document";
import * as Y from "yjs";

const departs = new Map<Y.Doc, number>();
const fermetures: (() => void)[] = [];

/** Une façade pose un écouteur sur cet événement à l'ouverture, et le retire à la fermeture. */
export function ecouteurs(doc: Y.Doc): number {
  return doc._observers.get("afterTransaction")?.size ?? 0;
}

function suivre(facade: DocumentEspace, depart: number): DocumentEspace {
  if (!departs.has(facade.doc)) {
    departs.set(facade.doc, depart);
  }
  fermetures.push(() => facade.fermer());
  return facade;
}

export function ouvrirFacade(doc: Y.Doc): DocumentEspace {
  const depart = ecouteurs(doc);
  return suivre(ouvrirDocumentEspace(doc), depart);
}

export function creerFacade(): DocumentEspace {
  const depart = ecouteurs(new Y.Doc());
  return suivre(creerDocumentEspace(), depart);
}

/** Nombre d'écouteurs que les documents suivis portent en plus de leur compte de départ. */
export function facadesEncoreOuvertes(): number {
  let ouvertes = 0;
  for (const [doc, depart] of departs) {
    ouvertes += Math.max(0, ecouteurs(doc) - depart);
  }
  return ouvertes;
}

/**
 * Ferme tout ce que les aides ont ouvert et rend le nombre de façades restées ouvertes malgré
 * cela ; les documents ne sont plus suivis ensuite, pour qu'un test ne paie pas pour le précédent.
 */
export function fermerLesFacades(): number {
  fermetures.splice(0).forEach((fermer) => fermer());
  const resteesOuvertes = facadesEncoreOuvertes();
  departs.clear();
  return resteesOuvertes;
}
