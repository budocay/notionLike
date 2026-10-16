// Table des versions forgées d'un document d'espace (F-018-AC58), tenue en ce seul endroit : le
// test du stockage l'éprouve sur `versionAdmiseApres`, la couture du format contre le serveur réel.
// Chaque cas part d'un document en version 2 sous sa forme stockée (amendement F-018 de l'ADR-0002 :
// `meta.version` à 2 et 2 inscrit dans le type racine `versions`), écrit sans le paquet du document
// pour ne dépendre que du format publié.
import { randomUUID } from "node:crypto";

import * as Y from "yjs";

export interface CasDeVersionForgee {
  readonly cas: string;
  readonly forger: (doc: Y.Doc) => void;
}

function versions(doc: Y.Doc): Y.Array<unknown> {
  return doc.getArray<unknown>("versions");
}

function meta(doc: Y.Doc): Y.Map<unknown> {
  return doc.getMap<unknown>("meta");
}

export const CAS_DE_VERSION_FORGEE: readonly CasDeVersionForgee[] = [
  { cas: "versions contenant 99", forger: (doc) => versions(doc).push([99]) },
  {
    // Conflit d'élévations : `meta.version` garde 2, la lecture retient le 3 de `versions`.
    cas: "versions contenant 3 alors que meta.version garde 2",
    forger: (doc) => versions(doc).push([3]),
  },
  { cas: "versions contenant 0", forger: (doc) => versions(doc).push([0]) },
  { cas: 'versions contenant "2"', forger: (doc) => versions(doc).push(["2"]) },
  { cas: "versions contenant 1.5", forger: (doc) => versions(doc).push([1.5]) },
  {
    // Une entrée nommée, de valeur admise : seule la nature du type est fautive.
    cas: "versions défini sous un Y.Map",
    forger: (doc) => doc.getMap<unknown>("versions").set("version", 2),
  },
  {
    cas: "versions défini sous un Y.Text",
    forger: (doc) => doc.getText("versions").insert(0, "2"),
  },
  { cas: "meta.version à 3", forger: (doc) => meta(doc).set("version", 3) },
  {
    cas: "version lue qui baisse de 2 à 1",
    forger: (doc) => {
      versions(doc).delete(0, versions(doc).length);
      meta(doc).set("version", 1);
    },
  },
];

// Une entrée de page de l'arborescence, de type `table` (amendement F-018 de l'ADR-0002).
export function ecrireUneTable(doc: Y.Doc, titre = "Table"): void {
  const champs = new Y.Map<unknown>();
  champs.set("titre", titre);
  champs.set("place", { parent: null, rang: "V" });
  champs.set("corbeille", false);
  champs.set("type", "table");
  doc.getMap("pages").set(randomUUID(), champs);
}

// La première table d'un espace, et l'élévation à 2 qui l'accompagne.
export function elevationADeux(doc: Y.Doc): void {
  meta(doc).set("version", 2);
  versions(doc).push([2]);
  ecrireUneTable(doc);
}

// Une mise à jour écrite par `ecrire` sur une copie de `source`, qui n'est pas touché.
export function miseAJourSurUneCopie(source: Y.Doc, ecrire: (doc: Y.Doc) => void): Uint8Array {
  const copie = new Y.Doc();
  Y.applyUpdate(copie, Y.encodeStateAsUpdate(source));
  const avant = Y.encodeStateVector(copie);
  ecrire(copie);
  const miseAJour = Y.encodeStateAsUpdate(copie, avant);
  copie.destroy();
  return miseAJour;
}

// Un document en version 2 : celui qu'un client tient, ou un document neuf.
export function documentEnVersionDeux(doc = new Y.Doc()): Y.Doc {
  Y.applyUpdate(doc, miseAJourSurUneCopie(doc, elevationADeux));
  return doc;
}
