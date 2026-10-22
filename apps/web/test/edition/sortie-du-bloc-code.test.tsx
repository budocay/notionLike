// Là où Tab n'est pas pris (F-033-AC20) et sortie au clavier par Échap puis Tab (F-033-AC22),
// part jsdom : l'événement non empêché et rien d'écrit ; le déplacement réel du focus n'est prouvé
// que de bout en bout (F-033-AC26, H12).
import { act } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import { bloc, documentForge } from "../aides-facade-page.ts";
import { textesDesBlocsCode } from "./aides-coloration.ts";
import {
  barreDeBlocs,
  enfoncerLaSourisDansLEditeur,
  entrerDansLEditeur,
  monterLEditeur,
  type OptionsDuMontage,
  poserLaComposition,
  presser,
  prisParLesGestionnaires,
  quitterLEditeur,
  selectionDansLeBloc,
  selectionnerDansLeBloc,
  selectionnerDe,
  zoneDeSaisie,
} from "./aides-edition.tsx";

/** Un bloc code `python` « ab » suivi d'un paragraphe « para », curseur à la fin de « ab ». */
function monter(options: OptionsDuMontage = {}): { doc: Y.Doc; emises: Uint8Array[] } {
  const montage = monterLEditeur(
    documentForge(bloc("codeBlock", "ab", { language: "python" }), bloc("paragraph", "para")),
    options,
  );
  entrerDansLEditeur();
  selectionnerDansLeBloc("ab", 2);
  return montage;
}

const MAJ = { shiftKey: true };

describe("là où Tab n'est pas pris", () => {
  it("F-033-AC20 éditeur en lecture seule, curseur dans un bloc code : Tab et Maj+Tab ne sont pas empêchés, aucune mise à jour", () => {
    const { doc, emises } = monter({ lectureSeule: true });

    expect([presser("Tab"), presser("Tab", MAJ), presser("Escape")]).toEqual([false, false, false]);
    expect(prisParLesGestionnaires("Tab")).toBe(false);
    expect(textesDesBlocsCode(doc)).toEqual(["ab"]);
    expect(emises).toEqual([]);
  });

  it("F-033-AC20 sélection qui déborde du bloc code sur le paragraphe qui le suit : Tab ne modifie pas le bloc code et n'est pas empêché", () => {
    const { doc, emises } = monter();
    selectionnerDe("ab", "para");

    expect(presser("Tab")).toBe(false);
    expect(presser("Tab", MAJ)).toBe(false);
    expect(textesDesBlocsCode(doc)).toEqual(["ab"]);
    expect(emises).toEqual([]);
  });

  it("F-033-AC20 composition en cours (`view.input.composing` posé sous jsdom) : Tab et Maj+Tab ne sont pris ni par la vue ni par le gestionnaire du bloc code, aucune mise à jour", () => {
    const { doc, emises } = monter();
    poserLaComposition(true);

    const parLaVue = [presser("Tab"), presser("Tab", MAJ)];
    const parLesGestionnaires = [
      prisParLesGestionnaires("Tab"),
      prisParLesGestionnaires("Tab", MAJ),
    ];
    poserLaComposition(false);

    expect(parLaVue).toEqual([false, false]);
    expect(parLesGestionnaires).toEqual([false, false]);
    expect(textesDesBlocsCode(doc)).toEqual(["ab"]);
    expect(emises).toEqual([]);
  });

  it.each([
    ["Ctrl", { ctrlKey: true }],
    ["Alt", { altKey: true }],
    ["Ctrl+Maj", { ctrlKey: true, shiftKey: true }],
  ])("F-033-AC20 Tab avec %s n'est pas pris et n'écrit rien", (_nom, modificateurs) => {
    const { doc, emises } = monter();

    expect(presser("Tab", modificateurs)).toBe(false);
    expect(textesDesBlocsCode(doc)).toEqual(["ab"]);
    expect(emises).toEqual([]);
  });
});

describe("sortie au clavier : Échap puis Tab", () => {
  it("F-033-AC22 Échap ne déplace pas le curseur et n'écrit rien ; Tab ou Maj+Tab qui suit n'est pas empêché, rien n'est écrit", () => {
    const { doc, emises } = monter();

    const echap = presser("Escape");
    const curseur = selectionDansLeBloc();
    const tab = presser("Tab");
    presser("Escape");
    const majTab = presser("Tab", MAJ);

    expect(echap).toBe(true);
    expect(curseur).toEqual({ ancre: 2, tete: 2 });
    expect([tab, majTab]).toEqual([false, false]);
    expect(textesDesBlocsCode(doc)).toEqual(["ab"]);
    expect(emises).toEqual([]);
  });

  it("F-033-AC22 Maj seule entre Échap et Tab ne désarme pas : Maj+Tab sort", () => {
    const { emises } = monter();

    presser("Escape");
    presser("Shift", { shiftKey: true, location: 1 });

    expect(presser("Tab", MAJ)).toBe(false);
    expect(emises).toEqual([]);
  });

  it.each([
    ["Flèche droite", () => void presser("ArrowRight")],
    ["une lettre", () => void presser("x")],
    ["un clic", () => enfoncerLaSourisDansLEditeur()],
    [
      "la perte du focus",
      () => {
        quitterLEditeur();
        entrerDansLEditeur();
      },
    ],
    ["un changement de la sélection", () => selectionnerDansLeBloc("ab", 1)],
  ])("F-033-AC22 Échap, %s, puis Tab : la sortie est désarmée, Tab indente", (_cas, entre) => {
    const { doc } = monter();

    presser("Escape");
    entre();
    const tab = presser("Tab");

    expect(tab).toBe(true);
    expect(textesDesBlocsCode(doc)[0]).toContain("  ");
    expect(document.activeElement).toBe(zoneDeSaisie());
  });

  it("F-033-AC22 F-003-AC42 depuis un bloc code, Alt+F10 mène à la barre de blocs, avant comme après Échap", () => {
    monter();

    presser("F10", { altKey: true });
    const premiere = barreDeBlocs()?.contains(document.activeElement);
    act(() => zoneDeSaisie().focus());
    selectionnerDansLeBloc("ab", 2);
    presser("Escape");
    presser("F10", { altKey: true });

    expect(premiere).toBe(true);
    expect(barreDeBlocs()?.contains(document.activeElement)).toBe(true);
  });
});
