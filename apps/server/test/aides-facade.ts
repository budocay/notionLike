// Seul fichier des tests d'apps/server qui fait entrer une fonction d'ouverture de la façade du
// document d'espace (F-012-AC29, F-002-AC31). Chaque façade ouverte ici est suivie, et
// `fermerLesFacades` les ferme toutes (F-002-AC30) : les tests l'appellent après chaque cas.
import {
  creerDocumentEspace,
  type DocumentEspace,
  ouvrirDocumentEspace,
} from "@notionlike/document";
import type * as Y from "yjs";

const ouvertes: DocumentEspace[] = [];

function suivre(facade: DocumentEspace): DocumentEspace {
  ouvertes.push(facade);
  return facade;
}

export function creerFacade(): DocumentEspace {
  return suivre(creerDocumentEspace());
}

export function ouvrirFacade(doc: Y.Doc): DocumentEspace {
  return suivre(ouvrirDocumentEspace(doc));
}

export function fermerLesFacades(): void {
  for (const facade of ouvertes.splice(0)) {
    facade.fermer();
  }
}
