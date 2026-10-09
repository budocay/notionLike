import { creerDocumentEspace, ErreurDocument } from "@notionlike/document";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import { demarrerSessionEspace } from "../src/espace/session-espace.ts";
import { LONGUEUR_MAX_TITRE, messageErreur } from "../src/interface/messages.ts";

const sources = import.meta.glob<string>("../src/**/*.{ts,tsx}", {
  query: "?raw",
  import: "default",
  eager: true,
});
const tests = Object.keys(import.meta.glob("./*.test.{ts,tsx}"));

// Chaque module d'apps/web qui importe @notionlike/document, et le test qui le couvre. Un module
// de plus, ou un test disparu, fait échouer l'énumération (F-002-AC20).
const MODULES_QUI_LISENT_LE_DOCUMENT: Readonly<Record<string, string>> = {
  "../src/espace/session-espace.ts": "./coquille.test.tsx",
  "../src/interface/Application.tsx": "./barre-laterale-erreurs.test.tsx",
  "../src/interface/BarreLaterale.tsx": "./barre-laterale.test.tsx",
  "../src/interface/RangeePage.tsx": "./barre-laterale.test.tsx",
  "../src/interface/ZonePrincipale.tsx": "./navigation.test.tsx",
  "../src/interface/messages.ts": "./barre-laterale-erreurs.test.tsx",
  "../src/interface/pages.ts": "./navigation.test.tsx",
  "../src/page/session-page.ts": "./page-session.test.ts",
};

function codeDuRefus(operation: () => unknown): string | undefined {
  try {
    operation();
    return undefined;
  } catch (erreur) {
    return erreur instanceof ErreurDocument ? erreur.code : "autre erreur";
  }
}

describe("coutures avec @notionlike/document", () => {
  it("F-002-AC20 énumère les modules qui importent @notionlike/document, chacun couvert par un test", () => {
    const importateurs = Object.entries(sources)
      .filter(([, texte]) => texte.includes('"@notionlike/document"'))
      .map(([chemin]) => chemin)
      .sort();

    expect(importateurs).toEqual(Object.keys(MODULES_QUI_LISENT_LE_DOCUMENT).sort());
    expect(tests).toEqual(expect.arrayContaining(Object.values(MODULES_QUI_LISENT_LE_DOCUMENT)));
  });

  it("F-002-AC22 seule la session importe yjs hors du module de persistance, et aucun module ne lit un type partagé", () => {
    const horsPersistance = Object.entries(sources).filter(
      ([chemin]) => !chemin.startsWith("../src/persistance/"),
    );
    const importateursDeYjs = horsPersistance
      .filter(([, texte]) => /from "yjs"/.test(texte))
      .map(([chemin]) => chemin);

    expect(importateursDeYjs).toEqual([
      "../src/edition/EditeurDePage.tsx",
      "../src/edition/extensions.ts",
      "../src/espace/session-espace.ts",
      "../src/page/session-page.ts",
    ]);
    for (const [chemin, texte] of horsPersistance) {
      expect(texte, chemin).not.toMatch(/\.(getMap|getArray|getText|transact)\(/);
      expect(texte, chemin).not.toContain("creerDocumentEspace");
      expect(texte, chemin).not.toContain("deplacerPage");
    }
  });

  it("F-003-AC24 F-003-AC27 la session de page est le seul module ajouté qui lit @notionlike/document, par ses exports de page ; seul le module d'édition importe la bibliothèque d'édition", () => {
    const sessionPage = sources["../src/page/session-page.ts"] ?? "";
    const importsDuDocument = /import \{([^}]+)\} from "@notionlike\/document";/.exec(sessionPage);
    const noms = (importsDuDocument?.[1] ?? "")
      .split(",")
      .map((nom) => nom.replace("type ", "").trim())
      .filter((nom) => nom !== "");

    expect(noms.sort()).toEqual(["DocumentPage", "ErreurDocument", "IdPage", "ouvrirDocumentPage"]);
    expect(MODULES_QUI_LISENT_LE_DOCUMENT["../src/page/session-page.ts"]).toBe(
      "./page-session.test.ts",
    );
    for (const [chemin, texte] of Object.entries(sources)) {
      // `eleverVersionPage` n'a aucun appelant dans l'application (F-003-AC31, AC32).
      expect(texte, chemin).not.toContain("eleverVersionPage");
      const importeLEdition = /from "(@tiptap\/|prosemirror-|y-prosemirror|y-protocols)/.test(
        texte,
      );
      expect(importeLEdition, chemin).toBe(importeLEdition && chemin.startsWith("../src/edition/"));
      if (chemin.startsWith("../src/edition/") || chemin.startsWith("../src/page/")) {
        expect(texte, chemin).not.toMatch(/from "\.\.\/(interface|espace|navigation)\//);
      }
    }
    expect(sources["../src/edition/index.ts"]).not.toMatch(/@tiptap|prosemirror/);
    expect(
      Object.keys(sources).filter((chemin) => /from "@tiptap\//.test(sources[chemin] ?? "")),
    ).toEqual([
      "../src/edition/BarreDeBlocs.tsx",
      "../src/edition/EditeurDePage.tsx",
      "../src/edition/extensions.ts",
    ]);
  });

  it("F-002-AC21 le document de la session et celui de creerDocumentEspace sont des Y.Doc de l'instance d'apps/web", () => {
    expect(demarrerSessionEspace().doc).toBeInstanceOf(Y.Doc);
    expect(creerDocumentEspace().doc).toBeInstanceOf(Y.Doc);
  });

  it("F-002-AC14 la limite citée par le message est celle de la façade : 200 accepté, 201 refusé", () => {
    const espace = creerDocumentEspace();

    expect(LONGUEUR_MAX_TITRE).toBe(200);
    expect(codeDuRefus(() => espace.creerPage("a".repeat(LONGUEUR_MAX_TITRE)))).toBeUndefined();
    expect(codeDuRefus(() => espace.creerPage("a".repeat(LONGUEUR_MAX_TITRE + 1)))).toBe(
      "titre-trop-long",
    );
    expect(messageErreur("titre-trop-long")).toContain(String(LONGUEUR_MAX_TITRE));
  });

  it("F-002-AC15 chaque code d'erreur du document a un message français, sans code ni identifiant", () => {
    const codes = [
      "page-introuvable",
      "page-a-la-corbeille",
      "deplacement-cyclique",
      "titre-trop-long",
      "position-invalide",
      "version-non-prise-en-charge",
      "version-invalide",
    ] as const;

    for (const code of codes) {
      const message = messageErreur(code);
      expect(message.length).toBeGreaterThan(20);
      expect(message).not.toContain(code);
      expect(message).not.toMatch(/[a-z]+-[a-z]+-[a-z]+|undefined|Error/);
    }
  });
});
