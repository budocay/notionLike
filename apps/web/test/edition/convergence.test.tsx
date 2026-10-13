// Convergence de deux répliques d'un même document de page, chacune modifiée par un éditeur
// (F-003-AC15), et édition réseau coupé (F-003-AC21).
import { act } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import { contenuLu } from "../aides-facade-page.ts";
import {
  annuler,
  collerDuHtml,
  commande,
  couperLeReseau,
  demonterLEditeur,
  entrerDansLEditeur,
  monterLEditeur,
  placerLeCurseurApres,
  presser,
  retablir,
  selectionnerLeBloc,
  taper,
} from "./aides-edition.tsx";

interface Scenario {
  /** Contenu de départ, saisi avant que les répliques ne se séparent. */
  readonly depart: () => void;
  readonly surA: () => void;
  readonly surB: () => void;
}

function docDuClient(identifiant: number): Y.Doc {
  const doc = new Y.Doc();
  doc.clientID = identifiant;
  return doc;
}

/**
 * Contenu lu de chaque réplique après échange, puis de deux documents vierges qui reçoivent les
 * mêmes mises à jour dans un ordre et dans l'autre.
 */
function lecturesApresConvergence({ depart, surA, surB }: Scenario): string[] {
  const a = docDuClient(1);
  monterLEditeur(a);
  entrerDansLEditeur();
  depart();
  const commun = Y.encodeStateAsUpdate(a);
  const vecteur = Y.encodeStateVector(a);
  const b = docDuClient(2);
  Y.applyUpdate(b, commun);
  surA();
  const deA = Y.encodeStateAsUpdate(a, vecteur);
  demonterLEditeur();
  monterLEditeur(b);
  entrerDansLEditeur();
  surB();
  const deB = Y.encodeStateAsUpdate(b, vecteur);
  demonterLEditeur();

  Y.applyUpdate(a, deB);
  Y.applyUpdate(b, deA);
  const tiers = [
    [deA, deB],
    [deB, deA],
  ].map((ordre, rang) => {
    const doc = docDuClient(10 + rang);
    [commun, ...ordre].forEach((miseAJour) => Y.applyUpdate(doc, miseAJour));
    return doc;
  });
  return [a, b, ...tiers].map((doc) => contenuLu(doc).toLowerCase());
}

function deuxParagraphes(): void {
  taper("un");
  presser("Enter");
  taper("deux");
}

describe("convergence de deux répliques", () => {
  it("F-003-AC15 du texte inséré dans deux paragraphes différents se retrouve sur les deux répliques, dans les deux ordres", () => {
    const lectures = lecturesApresConvergence({
      depart: deuxParagraphes,
      surA: () => {
        placerLeCurseurApres("un");
        taper("A");
      },
      surB: () => {
        placerLeCurseurApres("deux");
        taper("B");
      },
    });

    expect(lectures).toEqual(
      lectures.map(() => "<paragraph>una</paragraph><paragraph>deuxb</paragraph>"),
    );
    expect(lectures).toHaveLength(4);
  });

  it("F-003-AC15 du texte inséré au même endroit d'un même paragraphe converge, et les deux insertions y figurent", () => {
    const lectures = lecturesApresConvergence({
      depart: () => taper("mot"),
      surA: () => {
        placerLeCurseurApres("mot");
        taper("AAA");
      },
      surB: () => {
        placerLeCurseurApres("mot");
        taper("BBB");
      },
    });

    expect(new Set(lectures).size).toBe(1);
    expect(lectures[0]).toMatch(/^<paragraph>mot(aaabbb|bbbaaa)<\/paragraph>$/);
  });

  it("F-003-AC15 un bloc ajouté d'un côté pendant qu'un autre bloc change de type de l'autre converge, avec les textes des deux côtés", () => {
    const lectures = lecturesApresConvergence({
      depart: deuxParagraphes,
      surA: () => {
        placerLeCurseurApres("deux");
        presser("Enter");
        taper("trois");
      },
      surB: () => {
        placerLeCurseurApres("un");
        selectionnerLeBloc();
        act(() => commande("Titre 1").click());
      },
    });

    expect(lectures).toEqual(
      lectures.map(
        () =>
          '<heading level="1">un</heading><paragraph>deux</paragraph><paragraph>trois</paragraph>',
      ),
    );
  });
});

describe("édition réseau coupé", () => {
  it("F-003-AC21 saisie, séquence, commande, liste, imbrication, collage, annulation et rétablissement fonctionnent réseau coupé, sans qu'aucune requête ne soit émise", () => {
    const appels = couperLeReseau();
    const { doc } = monterLEditeur();
    entrerDansLEditeur();

    taper("# Titre");
    presser("Enter");
    taper("- un");
    presser("Enter");
    taper("deux");
    presser("Tab");
    presser("Enter");
    presser("Enter");
    presser("Enter");
    taper("corps");
    selectionnerLeBloc();
    act(() => commande("Titre 2").click());
    placerLeCurseurApres("corps");
    presser("Enter");
    collerDuHtml("<p>collé</p>");
    taper("!");
    annuler();
    retablir();

    expect(appels).toEqual([]);
    expect(contenuLu(doc).toLowerCase()).toBe(
      '<heading level="1">titre</heading><bulletlist><listitem><paragraph>un</paragraph><bulletlist><listitem><paragraph>deux</paragraph></listitem></bulletlist></listitem></bulletlist><heading level="2">corps</heading><paragraph>collé!</paragraph>',
    );
  });

  it("F-003-AC21 le piège voit un appel : chacune des quatre interfaces réseau lève et est notée", () => {
    const appels = couperLeReseau();

    for (const nom of ["fetch", "XMLHttpRequest", "WebSocket", "EventSource"] as const) {
      expect(() => (globalThis[nom] as unknown as () => void)(), nom).toThrow(/F-003-AC21/);
    }

    expect(appels).toEqual(["fetch", "XMLHttpRequest", "WebSocket", "EventSource"]);
  });
});
