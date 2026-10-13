// Dépendances de la bibliothèque d'édition : correctif de sécurité du collage et instance de yjs.
import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import verrou from "../../../pnpm-lock.yaml?raw";
import { ouvrirFacadeDePage } from "./aides-facade-page.ts";

const PLANCHER_DE_PROSEMIRROR_VIEW = "1.42.3";

/** Versions d'un paquet que ce texte de verrou résout, sans doublon. */
function versionsDansLeVerrou(texte: string, paquet: string): string[] {
  const entrees = texte.matchAll(new RegExp(`^ {2}'?${paquet}@([^(:']+)`, "gm"));
  return [...new Set([...entrees].flatMap((entree) => entree[1] ?? []))];
}

function numeros(version: string): number[] {
  return version.split(".").map((partie) => Number.parseInt(partie, 10));
}

function estInferieure(version: string, plancher: string): boolean {
  const [a, b] = [numeros(version), numeros(plancher)];
  for (let rang = 0; rang < b.length; rang += 1) {
    const ecart = (a[rang] ?? 0) - (b[rang] ?? 0);
    if (ecart !== 0) {
      return ecart < 0;
    }
  }
  return false;
}

function versionsSousLePlancher(texte: string): string[] {
  return versionsDansLeVerrou(texte, "prosemirror-view").filter((version) =>
    estInferieure(version, PLANCHER_DE_PROSEMIRROR_VIEW),
  );
}

describe("correctif de sécurité du collage", () => {
  it("F-003-AC30 le verrou résout au moins une version de prosemirror-view, et aucune sous 1.42.3", () => {
    const resolues = versionsDansLeVerrou(verrou, "prosemirror-view");

    expect(resolues.length).toBeGreaterThan(0);
    expect(versionsSousLePlancher(verrou)).toEqual([]);
  });

  it.each([
    ["  prosemirror-view@1.42.2:\n", ["1.42.2"]],
    ["  prosemirror-view@1.42.6:\n  prosemirror-view@1.41.9:\n", ["1.41.9"]],
    ["  'prosemirror-view@0.99.0(x@1.0.0)':\n", ["0.99.0"]],
    ["  prosemirror-view@1.42.3:\n  prosemirror-view@1.42.10:\n  prosemirror-view@2.0.0:\n", []],
  ])("F-003-AC30 le contrôle voit les versions sous le plancher dans %j", (texte, attendues) => {
    expect(versionsSousLePlancher(texte)).toEqual(attendues);
  });

  it("F-003-AC30 un verrou sans prosemirror-view ne résout aucune version : le contrôle échouerait", () => {
    expect(versionsDansLeVerrou("  prosemirror-model@1.25.12:\n", "prosemirror-view")).toEqual([]);
  });
});

describe("une seule instance de yjs, bibliothèques d'édition comprises", () => {
  it("F-003-AC26 le verrou ne résout qu'une version de yjs, et la liaison de l'éditeur s'y rattache", () => {
    expect(versionsDansLeVerrou(verrou, "yjs")).toHaveLength(1);
    const [version = ""] = versionsDansLeVerrou(verrou, "yjs");
    const pairs = [...verrou.matchAll(/\(yjs@([^)]+)\)/g)].map((trouve) => trouve[1]);

    expect(pairs.length).toBeGreaterThan(0);
    expect(new Set(pairs)).toEqual(new Set([version]));
    expect(verrou).toMatch(/^ {2}'@tiptap\/y-tiptap@[^']*\(yjs@/m);
  });

  it("F-003-AC26 le fragment fourni par @notionlike/document est une instance du type importé de yjs par apps/web", () => {
    const page = ouvrirFacadeDePage(new Y.Doc());

    expect(page.contenu).toBeInstanceOf(Y.XmlFragment);
    expect(page.doc).toBeInstanceOf(Y.Doc);
  });
});
