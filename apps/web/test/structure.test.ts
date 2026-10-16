import * as exportsDuDocument from "@notionlike/document";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import verrou from "../../../pnpm-lock.yaml?raw";
import manifesteWeb from "../package.json" with { type: "json" };
import * as persistance from "../src/persistance/index.ts";
import sourceDeLInterface from "../src/persistance/index.ts?raw";
import { creerFacade } from "./aides-facade.ts";

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
      // F-012 : le serveur de synchronisation déclare yjs à la même version (F-012-AC30).
      "../../server/package.json",
      "../package.json",
    ]);
    expect(new Set(Object.values(declarees)).size).toBe(1);
    expect(versionsResolues("yjs")).toEqual(Object.values(declarees).slice(0, 1));
  });

  it("F-002-AC21 le document fourni par creerDocumentEspace est une instance du Y.Doc importé par apps/web", () => {
    expect(creerFacade().doc).toBeInstanceOf(Y.Doc);
  });
});

describe("frontières du module de persistance", () => {
  it("F-002-AC22 persistance/index.ts exporte exactement ouvrirPersistance, ouvrirEspaceLocal et ErreurPersistance, sans rien de y-indexeddb", () => {
    expect(Object.keys(persistance).sort()).toEqual([
      "ErreurPersistance",
      // F-013 : effacement de la base du document d'espace (AC24).
      "effacerBaseDeDocument",
      // F-007 : effacement d'une base de page.
      "effacerBaseDePage",
      // F-013 : registre de l'appareil (H3).
      "inscrireAuRegistre",
      "lireLeRegistre",
      // F-013-AC16 : le nom de base d'un document, pour la correspondance avec son nom au serveur.
      "nomDeBase",
      "ouvrirEspaceLocal",
      "ouvrirPersistance",
      "retirerDuRegistre",
    ]);
    expect(sourceDeLInterface).not.toContain("y-indexeddb");
    expect(sourceDeLInterface.match(/type \w+/g)?.sort()).toEqual([
      // F-007 : désignation et issue d'un effacement.
      "type DesignationDeBaseDePage",
      "type DesignationDocument",
      // F-013 : registre de l'appareil.
      "type Droit",
      "type EntreeDuRegistre",
      "type EtatPersistance",
      "type IssueDEffacement",
      "type LectureDuRegistre",
      "type Persistance",
      "type PersistanceEspaceLocal",
    ]);
  });

  it("F-002-AC22 les dépendances d'exécution d'apps/web sont celles du plan, y-indexeddb comprise une seule fois", () => {
    // F-010 : contrats, et better-auth pour son seul sous-chemin `better-auth/client` (H9).
    // F-013 : @hocuspocus/provider, réservé au module de synchronisation (F-013-AC38).
    // F-028 : gras, italique et lien, réservés au module d'édition (F-028-AC29).
    // F-006 : dnd-kit, réservé au module de glisser-déposer, et la poignée de bloc et le curseur de
    // dépôt, réservés au module d'édition (F-006-AC32).
    expect(Object.keys(manifesteWeb.dependencies).sort()).toEqual([
      "@dnd-kit/core",
      "@dnd-kit/sortable",
      "@dnd-kit/utilities",
      "@hocuspocus/provider",
      "@notionlike/contrats",
      "@notionlike/document",
      "@tiptap/core",
      "@tiptap/extension-bold",
      "@tiptap/extension-collaboration",
      "@tiptap/extension-document",
      "@tiptap/extension-drag-handle",
      "@tiptap/extension-drag-handle-react",
      "@tiptap/extension-heading",
      "@tiptap/extension-italic",
      "@tiptap/extension-link",
      "@tiptap/extension-list",
      "@tiptap/extension-node-range",
      "@tiptap/extension-paragraph",
      "@tiptap/extension-text",
      "@tiptap/extensions",
      "@tiptap/pm",
      "@tiptap/react",
      "@tiptap/y-tiptap",
      "better-auth",
      "react",
      "react-dom",
      "y-indexeddb",
      "y-protocols",
      "yjs",
    ]);
    expect(Object.keys(manifesteWeb.devDependencies)).not.toContain("y-indexeddb");
  });
});

// Les fichiers de configuration d'apps/web et de la racine où une résolution peut être détournée :
// `resolve.alias` de Vite, de Vitest ou de Playwright, `paths` de TypeScript.
const configurations = import.meta.glob<string>(
  [
    "../{vite,vitest,playwright}.config.*",
    "../tsconfig*.json",
    "../../../{vite,vitest,playwright}.config.*",
    "../../../vitest.workspace.*",
    "../../../tsconfig*.json",
  ],
  { query: "?raw", import: "default", eager: true },
);
const NOM_DU_PAQUET = "@notionlike/document";
const SOUS_CHEMINS_NON_DECLARES = ["src/arbre", "src/arbre.ts", "src/index.ts", "package.json"];

function detourneLaResolution(configuration: string): boolean {
  return /\balias\b|"paths"|\bpaths\s*:|@notionlike\/document|packages\/document/.test(
    configuration,
  );
}

describe("@notionlike/document résolu par son nom", () => {
  it("F-002-AC32 F-002-AC31 F-003-AC24 importé par son nom de paquet, il rend exactement les exports de F-001 et ceux de la façade de page de F-003", () => {
    expect(Object.keys(exportsDuDocument).sort()).toEqual([
      "ErreurDocument",
      "TABLE_DES_VERSIONS_PAGE",
      "VERSION_PAGE_PRISE_EN_CHARGE",
      "creerDocumentEspace",
      "lireVersionPage",
      "ouvrirDocumentEspace",
      "ouvrirDocumentPage",
    ]);
  });

  it("F-002-AC32 aucun fichier de configuration d'apps/web ni de la racine ne porte d'alias ni de chemin de substitution vers le paquet", () => {
    expect(Object.keys(configurations).sort()).toEqual([
      "../../../tsconfig.base.json",
      "../../../vitest.config.ts",
      "../playwright.config.ts",
      "../tsconfig.json",
      "../vite.config.ts",
      "../vitest.config.ts",
    ]);
    for (const [chemin, configuration] of Object.entries(configurations)) {
      expect(detourneLaResolution(configuration), chemin).toBe(false);
    }
    expect(detourneLaResolution('resolve: { alias: { "@doc": "/src" } }')).toBe(true);
    expect(detourneLaResolution('{ "compilerOptions": { "paths": {} } }')).toBe(true);
    expect(detourneLaResolution('include: ["../../packages/document/src"]')).toBe(true);
  });

  it.each(SOUS_CHEMINS_NON_DECLARES)(
    "F-002-AC32 le sous-chemin %s, que le champ exports ne déclare pas, n'est pas résolu",
    async (sousChemin) => {
      // Assemblé à l'exécution : écrit en clair, cet import ferait échouer le chargement du fichier.
      const nonDeclare = [NOM_DU_PAQUET, sousChemin].join("/");

      await expect(import(/* @vite-ignore */ nonDeclare)).rejects.toThrow(/is not exported/);
    },
  );

  it("F-002-AC32 le même import assemblé à l'exécution aboutit pour l'entrée que le champ exports déclare", async () => {
    const declare: string = NOM_DU_PAQUET;

    expect(Object.keys(await import(/* @vite-ignore */ declare)).sort()).toEqual([
      "ErreurDocument",
      "TABLE_DES_VERSIONS_PAGE",
      "VERSION_PAGE_PRISE_EN_CHARGE",
      "creerDocumentEspace",
      "lireVersionPage",
      "ouvrirDocumentEspace",
      "ouvrirDocumentPage",
    ]);
  });
});
