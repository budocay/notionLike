import { creerDocumentEspace, ouvrirDocumentPage } from "@notionlike/document";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import verrou from "../../../pnpm-lock.yaml?raw";
import manifesteWeb from "../package.json" with { type: "json" };
import * as persistance from "../src/persistance/index.ts";
import sourceDeLInterface from "../src/persistance/index.ts?raw";

interface Manifeste {
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly devDependencies?: Readonly<Record<string, string>>;
}

const manifestes = import.meta.glob<Manifeste>(
  ["../../../package.json", "../../*/package.json", "../../../packages/*/package.json"],
  { eager: true, import: "default" },
);

function versionsDeclarees(paquet: string): Record<string, string> {
  const versions: Record<string, string> = {};
  for (const [chemin, manifeste] of Object.entries(manifestes)) {
    const version = manifeste.dependencies?.[paquet] ?? manifeste.devDependencies?.[paquet];
    if (version !== undefined) {
      versions[chemin] = version;
    }
  }
  return versions;
}

function versionsResolues(paquet: string): string[] {
  const entrees = verrou.matchAll(new RegExp(`^ {2}'?${paquet}@([^(:']+)`, "gm"));
  return [...new Set([...entrees].flatMap((entree) => entree[1] ?? []))];
}

describe("une seule instance de yjs", () => {
  it("F-002-AC21 les manifestes du workspace qui déclarent yjs demandent tous la même version, et le verrou n'en résout qu'une", () => {
    const declarees = versionsDeclarees("yjs");

    expect(Object.keys(declarees).sort()).toEqual([
      "../../../packages/document/package.json",
      "../package.json",
    ]);
    expect(new Set(Object.values(declarees)).size).toBe(1);
    expect(versionsResolues("yjs")).toEqual(Object.values(declarees).slice(0, 1));
  });

  it("F-002-AC21 le document fourni par creerDocumentEspace est une instance du Y.Doc importé par apps/web", () => {
    expect(creerDocumentEspace().doc).toBeInstanceOf(Y.Doc);
  });
});

const sourcesWeb = import.meta.glob<string>("../src/**/*.{ts,tsx,css}", {
  query: "?raw",
  import: "default",
  eager: true,
});
const pageHote = import.meta.glob<string>("../index.html", {
  query: "?raw",
  import: "default",
  eager: true,
});

function comparerLesVersions(a: string, b: string): number {
  const [partiesA, partiesB] = [a, b].map((version) => version.split(".").map(Number));
  for (let rang = 0; rang < 3; rang += 1) {
    const ecart = (partiesA?.[rang] ?? 0) - (partiesB?.[rang] ?? 0);
    if (ecart !== 0) {
      return ecart;
    }
  }
  return 0;
}

describe("dépendances d'édition", () => {
  it("F-003-AC26 une seule version de yjs dans les manifestes et le verrou, bibliothèques d'édition comprises, et le fragment de la façade est un Y.XmlFragment d'apps/web", () => {
    const declarees = versionsDeclarees("yjs");

    expect(Object.keys(manifestes).length).toBeGreaterThanOrEqual(3);
    expect(new Set(Object.values(declarees)).size).toBe(1);
    expect(versionsResolues("yjs")).toHaveLength(1);
    expect(versionsResolues("@tiptap/y-tiptap")).toHaveLength(1);
    expect(versionsResolues("@tiptap/extension-collaboration")).toHaveLength(1);
    expect(verrou).not.toMatch(/^ {2}'?y-prosemirror@/m);
    const page = ouvrirDocumentPage(new Y.Doc());
    expect(page.contenu).toBeInstanceOf(Y.XmlFragment);
    expect(page.doc).toBeInstanceOf(Y.Doc);
  });

  it("F-003-AC30 toutes les versions résolues de prosemirror-view sont au moins la 1.42.3", () => {
    const resolues = versionsResolues("prosemirror-view");

    expect(resolues.length).toBeGreaterThan(0);
    for (const version of resolues) {
      expect(version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(comparerLesVersions(version, "1.42.3"), version).toBeGreaterThanOrEqual(0);
    }
    expect(comparerLesVersions("1.42.2", "1.42.3")).toBeLessThan(0);
    expect(comparerLesVersions("1.9.9", "1.42.3")).toBeLessThan(0);
    expect(comparerLesVersions("2.0.0", "1.42.3")).toBeGreaterThan(0);
  });

  it("F-003-AC20 aucun fichier source d'apps/web n'injecte de HTML brut", () => {
    const fichiers = { ...sourcesWeb, ...pageHote };
    const chemins = Object.keys(fichiers);

    expect(chemins).toContain("../src/edition/EditeurDePage.tsx");
    expect(chemins).toContain("../src/edition/BarreDeBlocs.tsx");
    expect(chemins).toContain("../src/interface/ZonePrincipale.tsx");
    expect(chemins).toContain("../index.html");
    for (const [chemin, texte] of Object.entries(fichiers)) {
      expect(texte, chemin).not.toMatch(
        /innerHTML|outerHTML|insertAdjacentHTML|dangerouslySetInnerHTML|document\.write|createContextualFragment|DOMParser/,
      );
    }
  });
});

describe("frontières du module de persistance", () => {
  it("F-002-AC22 persistance/index.ts exporte exactement ouvrirPersistance, ouvrirEspaceLocal et ErreurPersistance, sans rien de y-indexeddb", () => {
    expect(Object.keys(persistance).sort()).toEqual([
      "ErreurPersistance",
      "ouvrirEspaceLocal",
      "ouvrirPersistance",
    ]);
    expect(sourceDeLInterface).not.toContain("y-indexeddb");
    expect(sourceDeLInterface.match(/type \w+/g)?.sort()).toEqual([
      "type DesignationDocument",
      "type EtatPersistance",
      "type Persistance",
      "type PersistanceEspaceLocal",
    ]);
  });

  it("F-002-AC22 les dépendances d'exécution d'apps/web sont celles du plan, y-indexeddb comprise une seule fois", () => {
    expect(Object.keys(manifesteWeb.dependencies).sort()).toEqual([
      "@notionlike/document",
      "@tiptap/core",
      "@tiptap/extension-collaboration",
      "@tiptap/extension-document",
      "@tiptap/extension-heading",
      "@tiptap/extension-list",
      "@tiptap/extension-paragraph",
      "@tiptap/extension-text",
      "@tiptap/pm",
      "@tiptap/react",
      "@tiptap/y-tiptap",
      "react",
      "react-dom",
      "y-indexeddb",
      "y-protocols",
      "yjs",
    ]);
  });
});
