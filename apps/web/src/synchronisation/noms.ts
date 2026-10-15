// Correspondance terme à terme entre la base locale d'un document et son nom sur le serveur
// (F-013-AC16, F-002 H3, F-012 H2) : une seule fonction, qui n'assemble aucun des deux noms à la main.
// Le nom de document vient du codec de `packages/contrats`, le nom de base de la fonction de nommage
// du module de persistance ; chacun reçoit les mêmes identifiants, l'espace ouvert compris.
import { type DocumentNomme, nomDeDocument, type TypeDeDocument } from "@notionlike/contrats";

import { type DesignationDocument, nomDeLaBase } from "./stockage.ts";

export interface Correspondance {
  readonly document: DocumentNomme;
  readonly nomDeDocument: string;
  readonly designation: DesignationDocument;
  readonly nomDeBase: string;
}

function designationDe(type: TypeDeDocument, idEspace: string, id: string): DesignationDocument {
  switch (type) {
    case "espace":
      return { type, idEspace };
    case "page":
      return { type, idEspace, idPage: id };
    case "table":
      return { type, idEspace, idTable: id };
  }
}

/**
 * Le document d'un type, de l'espace ouvert et d'un identifiant (celui de l'espace pour le document
 * d'espace). Lève, par la fonction de nommage, si un identifiant n'a pas la forme admise.
 */
export function correspondance(
  type: TypeDeDocument,
  idEspace: string,
  idDocument: string = idEspace,
): Correspondance {
  const designation = designationDe(type, idEspace, idDocument);
  const document: DocumentNomme = {
    type,
    idEspace,
    idDocument: type === "espace" ? idEspace : idDocument,
  };
  return {
    document,
    nomDeDocument: nomDeDocument(document),
    designation,
    nomDeBase: nomDeLaBase(designation),
  };
}
