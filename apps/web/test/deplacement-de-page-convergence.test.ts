// Deux répliques du document d'espace déplacent la même page, par les destinations de cette feature,
// sans rien échanger, puis convergent (F-006-AC27) : la barre latérale lue est la même des deux
// côtés, chaque page une seule fois (F-001-AC7 à AC9, ADR-0002).
import type { DocumentEspace, PageLue } from "@notionlike/document";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import {
  destinationDeLaCommande,
  type Destination,
  destinationDuDepot,
} from "../src/interface/destination-de-page.ts";
import { creerFacade, ouvrirFacade } from "./aides-facade.ts";

function enTitres(pages: readonly PageLue[]): string {
  return pages
    .map(({ titre, enfants }) => (enfants.length === 0 ? titre : `${titre}(${enTitres(enfants)})`))
    .join(",");
}

function identifiants(pages: readonly PageLue[]): string[] {
  return pages.flatMap((page) => [page.id, ...identifiants(page.enfants)]);
}

function idDe(espace: DocumentEspace, titre: string): string {
  const aVoir = [...espace.lire().racines];
  for (const page of aVoir) {
    if (page.titre === titre) {
      return page.id;
    }
    aVoir.push(...page.enfants);
  }
  throw new Error(`Aucune page « ${titre} ».`);
}

type Geste = (espace: DocumentEspace) => Destination;

function appliquer(espace: DocumentEspace, titre: string, geste: Geste): void {
  const destination = geste(espace);
  if (destination.sorte !== "deplacer") {
    throw new Error(`Aucune destination pour « ${titre} » : ${destination.sorte}.`);
  }
  espace.deplacerPage(idDe(espace, titre), destination.ou);
}

/** P, Q, R à la racine, S sous R ; chaque réplique déplace, puis elles échangent. */
function apresConvergence(
  surA: readonly [string, Geste],
  surB: readonly [string, Geste],
): { readonly lues: string[]; readonly doublons: number; readonly nombre: number } {
  const depart = creerFacade();
  const r = depart.creerPage("R");
  ["P", "Q"].forEach((titre, position) => depart.creerPage(titre, { parent: null, position }));
  depart.creerPage("S", { parent: r });
  const commun = Y.encodeStateAsUpdate(depart.doc);
  const [a, b] = [1, 2].map((identifiant) => {
    const doc = new Y.Doc();
    doc.clientID = identifiant;
    Y.applyUpdate(doc, commun);
    return ouvrirFacade(doc);
  }) as [DocumentEspace, DocumentEspace];
  const vecteur = Y.encodeStateVector(a.doc);
  appliquer(a, ...surA);
  appliquer(b, ...surB);
  const [deA, deB] = [a, b].map((espace) => Y.encodeStateAsUpdate(espace.doc, vecteur));
  Y.applyUpdate(a.doc, deB ?? new Uint8Array());
  Y.applyUpdate(b.doc, deA ?? new Uint8Array());
  const lues = [a, b].map((espace) => enTitres(espace.lire().racines));
  const ids = identifiants(a.lire().racines);
  return { lues, doublons: ids.length - new Set(ids).size, nombre: ids.length };
}

describe("convergence de deux déplacements de la même page", () => {
  it.each([
    [
      "à deux places différentes, par une commande et un lâcher",
      [
        "P",
        (e: DocumentEspace) => destinationDeLaCommande(e.lire().racines, idDe(e, "P"), "descendre"),
      ],
      [
        "P",
        (e: DocumentEspace) =>
          destinationDuDepot(e.lire().racines, idDe(e, "P"), idDe(e, "S"), "dans"),
      ],
    ],
    [
      "à deux places différentes, par deux commandes",
      [
        "Q",
        (e: DocumentEspace) =>
          destinationDeLaCommande(e.lire().racines, idDe(e, "Q"), "sous-la-precedente"),
      ],
      [
        "Q",
        (e: DocumentEspace) => destinationDeLaCommande(e.lire().racines, idDe(e, "Q"), "monter"),
      ],
    ],
    [
      "dans deux pages différentes, par deux lâchers",
      [
        "Q",
        (e: DocumentEspace) =>
          destinationDuDepot(e.lire().racines, idDe(e, "Q"), idDe(e, "S"), "dans"),
      ],
      [
        "Q",
        (e: DocumentEspace) =>
          destinationDuDepot(e.lire().racines, idDe(e, "Q"), idDe(e, "P"), "dans"),
      ],
    ],
    [
      "l'une sous l'autre et inversement",
      [
        "Q",
        (e: DocumentEspace) =>
          destinationDuDepot(e.lire().racines, idDe(e, "Q"), idDe(e, "P"), "dans"),
      ],
      [
        "P",
        (e: DocumentEspace) =>
          destinationDuDepot(e.lire().racines, idDe(e, "P"), idDe(e, "Q"), "dans"),
      ],
    ],
  ] as const)(
    "F-006-AC27 %s : la même arborescence des deux côtés, chaque page une seule fois",
    (_cas, surA, surB) => {
      const { lues, doublons, nombre } = apresConvergence(surA, surB);

      expect(lues[0]).toBe(lues[1]);
      expect(doublons).toBe(0);
      expect(nombre).toBe(4);
    },
  );
});
