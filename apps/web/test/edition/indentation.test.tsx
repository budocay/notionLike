// Indentation du bloc code au clavier (F-033-AC15 à AC19) : Tab, Maj+Tab et Entrée joués par les
// événements clavier de l'éditeur monté, le texte lu par `yjs` seul.
import { lireVersionPage } from "@notionlike/document";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import { bloc, contenuLu, documentForge } from "../aides-facade-page.ts";
import { textesDesBlocsCode } from "./aides-coloration.ts";
import {
  annuler,
  cloreLHistorique,
  entrerDansLEditeur,
  monterLEditeur,
  placerLeCurseurAuDebutDe,
  poserLaComposition,
  presser,
  prisParLesGestionnaires,
  retablir,
  selectionDansLeBloc,
  selectionnerDansLeBloc,
  selectionVueParLEditeur,
  taper,
  toutSelectionner,
  zoneDeSaisie,
} from "./aides-edition.tsx";

/** Un éditeur monté sur un document d'un seul bloc code `typescript` de ce texte, focus dedans. */
function blocCode(texte: string): { doc: Y.Doc; emises: Uint8Array[] } {
  const montage = monterLEditeur(
    documentForge(bloc("codeBlock", texte, { language: "typescript" })),
  );
  entrerDansLEditeur();
  return montage;
}

/** Le texte du bloc code, la sélection dans son texte, et le focus resté dans l'éditeur. */
function lu(doc: Y.Doc) {
  return {
    texte: textesDesBlocsCode(doc)[0],
    ...selectionDansLeBloc(),
    focus: document.activeElement === zoneDeSaisie(),
  };
}

const TAB = (): boolean => presser("Tab");
const MAJ_TAB = (): boolean => presser("Tab", { shiftKey: true });

describe("Tab, sélection vide", () => {
  it("F-033-AC15 un cran au curseur, au milieu d'une ligne comme en tête, curseur après lui, touche prise et focus gardé", () => {
    const { doc, emises } = blocCode("ab\ncd");
    selectionnerDansLeBloc("ab", 1);

    const prise = TAB();
    const auMilieu = lu(doc);
    selectionnerDansLeBloc("cd", 5);
    TAB();

    expect(prise).toBe(true);
    expect(auMilieu).toEqual({ texte: "a  b\ncd", ancre: 3, tete: 3, focus: true });
    expect(lu(doc)).toEqual({ texte: "a  b\n  cd", ancre: 7, tete: 7, focus: true });
    expect(emises).toHaveLength(2);
  });

  it("F-033-AC15 dans un bloc code d'un élément de liste, l'élément n'est ni imbriqué ni remonté", () => {
    const liste = new Y.XmlElement("bulletList");
    const [premier, second] = [new Y.XmlElement("listItem"), new Y.XmlElement("listItem")];
    premier.insert(0, [bloc("paragraph", "un")]);
    second.insert(0, [bloc("paragraph", "deux"), bloc("codeBlock", "code")]);
    liste.insert(0, [premier, second]);
    const doc = documentForge(liste);
    monterLEditeur(doc);
    entrerDansLEditeur();
    placerLeCurseurAuDebutDe("code");
    const avant = contenuLu(doc);

    expect([TAB(), MAJ_TAB(), MAJ_TAB()]).toEqual([true, true, true]);
    expect(contenuLu(doc)).toBe(avant);
  });
});

describe("Tab, sélection non vide", () => {
  it("F-033-AC16 une partie d'une seule ligne : un cran en tête de la ligne, rien de remplacé, le même texte sélectionné", () => {
    const { doc } = blocCode("abcdef");
    selectionnerDansLeBloc("abcdef", 2, 4);

    TAB();

    expect(lu(doc)).toEqual({ texte: "  abcdef", ancre: 4, tete: 6, focus: true });
    expect(selectionVueParLEditeur()).toBe("cd");
  });

  it("F-033-AC16 trois lignes dont une vide, sélection depuis la première colonne : la ligne vide n'est pas indentée, les crans de tête entrent dans la sélection", () => {
    const { doc } = blocCode("a\n\nb");
    selectionnerDansLeBloc("a", 0, 4);

    TAB();

    expect(lu(doc)).toEqual({ texte: "  a\n\n  b", ancre: 0, tete: 8, focus: true });
    expect(selectionVueParLEditeur()).toBe("  a\n\n  b");
  });

  it("F-033-AC16 une sélection qui finit à la première colonne d'une ligne n'indente pas cette ligne ; vers l'arrière, la sélection garde son sens", () => {
    const { doc } = blocCode("ab\ncd\nef");
    selectionnerDansLeBloc("ab", 3, 1);

    TAB();

    expect(lu(doc)).toEqual({ texte: "  ab\ncd\nef", ancre: 5, tete: 3, focus: true });
    expect(selectionVueParLEditeur()).toBe("b\n");
  });

  it("F-033-AC16 Mod+A dans un bloc code seul de la page : chaque ligne non vide indentée, tout le texte sélectionné", () => {
    const { doc, emises } = blocCode("x\n\ny");
    toutSelectionner();

    TAB();

    expect(textesDesBlocsCode(doc)).toEqual(["  x\n\n  y"]);
    expect(selectionVueParLEditeur()).toBe("  x\n\n  y");
    expect(emises).toHaveLength(1);
  });
});

describe("Maj+Tab", () => {
  it.each([
    ["quatre espaces, curseur en fin", "    ab", 6, "  ab", 4],
    ["une espace", " ab", 3, "ab", 2],
    ["une tabulation", "\tab", 3, "ab", 2],
    ["une tabulation suivie d'espaces", "\t  ab", 1, "  ab", 0],
    ["le curseur dans l'indentation", "    ab", 1, "  ab", 0],
  ])(
    "F-033-AC17 %s : au plus un cran retiré en tête de la ligne du curseur, curseur sur le même texte",
    (_cas, texte, curseur, attendu, apres) => {
      const { doc } = blocCode(texte);
      selectionnerDansLeBloc("ab", curseur);

      const prise = MAJ_TAB();

      expect(prise).toBe(true);
      expect(lu(doc)).toEqual({ texte: attendu, ancre: apres, tete: apres, focus: true });
    },
  );

  it("F-033-AC17 plusieurs lignes : chaque ligne touchée perd un cran, la sélection reste sur le même texte", () => {
    const { doc } = blocCode("  a\n\tb\n    c\nd");
    selectionnerDansLeBloc("a", 2, 13);

    MAJ_TAB();

    // La sélection finit à la première colonne de « d », qui n'est pas touchée.
    expect(lu(doc)).toEqual({ texte: "a\nb\n  c\nd", ancre: 0, tete: 8, focus: true });
    expect(selectionVueParLEditeur()).toBe("a\nb\n  c\n");
  });

  it("F-033-AC17 aucune ligne touchée ne s'ouvre d'une espace ou d'une tabulation : rien de modifié, aucune mise à jour, touche prise et focus gardé", () => {
    const { doc, emises } = blocCode("ab\n  cd");
    selectionnerDansLeBloc("ab", 0, 2);

    const prise = MAJ_TAB();

    expect(prise).toBe(true);
    expect(lu(doc)).toEqual({ texte: "ab\n  cd", ancre: 0, tete: 2, focus: true });
    expect(emises).toEqual([]);
  });
});

describe("Entrée reprend l'indentation", () => {
  it.each([
    ["en fin d'une ligne indentée de quatre espaces", "    ab", 6, 6, "    ab\n    ", 11],
    ["en fin d'une ligne indentée d'une tabulation", "\tab", 3, 3, "\tab\n\t", 5],
    ["en fin d'une ligne sans indentation", "ab", 2, 2, "ab\n", 3],
    [
      "entre la première et la deuxième espace d'une indentation de quatre",
      "    ab",
      1,
      1,
      " \n    ab",
      3,
    ],
    ["sur une sélection de plusieurs lignes", "  ab\n  cd", 3, 7, "  a\n  cd", 6],
  ])(
    "F-033-AC18 F-005-AC3 %s : la sélection remplacée par un saut de ligne et la part de l'indentation qui précède son début, aucun bloc créé",
    (_cas, texte, ancre, tete, attendu, curseur) => {
      const { doc, emises } = blocCode(texte);
      selectionnerDansLeBloc("ab", ancre, tete);

      const prise = presser("Enter");

      expect(prise).toBe(true);
      expect(lu(doc)).toEqual({ texte: attendu, ancre: curseur, tete: curseur, focus: true });
      expect(textesDesBlocsCode(doc)).toHaveLength(1);
      expect(zoneDeSaisie().querySelectorAll("p")).toHaveLength(0);
      expect(emises).toHaveLength(1);
    },
  );

  // Amendé par F-040-AC4 (H4) : la troisième Entrée en fin de bloc sort du bloc.
  it("F-033-AC18 F-005-AC3 Entrée répétée ne sort pas du bloc tant que le texte ne se termine pas par deux lignes vides", () => {
    const { doc } = blocCode("  ab");
    selectionnerDansLeBloc("ab", 4);

    presser("Enter");
    presser("Enter");

    expect(textesDesBlocsCode(doc)).toEqual(["  ab\n  \n  "]);
    expect(zoneDeSaisie().querySelectorAll("p")).toHaveLength(0);
  });

  it("F-033-AC18 une composition en cours (`view.input.composing` posé sous jsdom) : Entrée n'est prise ni par la vue, ni par le gestionnaire du bloc code", () => {
    const { doc } = blocCode("  ab");
    selectionnerDansLeBloc("ab", 4);
    poserLaComposition(true);

    const parLaVue = presser("Enter");
    const avant = textesDesBlocsCode(doc);
    // Sans la garde de la vue, le gestionnaire du bloc code se retire : l'Entrée de base de
    // l'éditeur insère un saut de ligne seul, sans reprise d'indentation.
    prisParLesGestionnaires("Enter");
    poserLaComposition(false);

    expect(parLaVue).toBe(false);
    expect(avant).toEqual(["  ab"]);
    expect(textesDesBlocsCode(doc)).toEqual(["  ab\n"]);
  });
});

describe("une transaction, une annulation", () => {
  /** Un bloc code saisi par la règle de saisie : la version du document est élevée à 3. */
  function blocSaisi(lignes: readonly string[]): { doc: Y.Doc; emises: Uint8Array[] } {
    const montage = monterLEditeur();
    entrerDansLEditeur();
    taper("``` ");
    taper(lignes.join("\n"));
    return montage;
  }

  it.each([
    ["une indentation de trois lignes", ["a", "b", "c"], TAB, "  a\n  b\n  c"],
    ["une désindentation de trois lignes", ["  a", "\tb", " c"], MAJ_TAB, "a\nb\nc"],
  ])(
    "F-033-AC19 F-005-AC26 %s : une seule mise à jour ; Mod+Z rend le texte et la sélection d'avant en une étape, Mod+Maj+Z la rétablit, la version ne baisse pas",
    (_cas, lignes, touche, attendu) => {
      const { doc, emises } = blocSaisi(lignes);
      const avant = lignes.join("\n");
      selectionnerDansLeBloc(lignes[0] ?? "", 0, avant.length);
      cloreLHistorique();
      const nombre = emises.length;

      touche();
      const apres = [textesDesBlocsCode(doc), emises.length - nombre];
      cloreLHistorique();
      annuler();
      const annule = [textesDesBlocsCode(doc), selectionDansLeBloc()];
      retablir();

      expect(apres).toEqual([[attendu], 1]);
      expect(annule).toEqual([[avant], { ancre: 0, tete: avant.length }]);
      expect(textesDesBlocsCode(doc)).toEqual([attendu]);
      expect(lireVersionPage(doc)).toBe(3);
    },
  );

  it("F-033-AC19 une Entrée qui reprend une indentation : une mise à jour, annulée en une étape, curseur rendu", () => {
    const { doc, emises } = blocSaisi(["    ab"]);
    selectionnerDansLeBloc("ab", 6);
    cloreLHistorique();
    const nombre = emises.length;

    presser("Enter");
    const apres = [textesDesBlocsCode(doc), emises.length - nombre];
    cloreLHistorique();
    annuler();

    expect(apres).toEqual([["    ab\n    "], 1]);
    expect(textesDesBlocsCode(doc)).toEqual(["    ab"]);
    expect(selectionDansLeBloc()).toEqual({ ancre: 6, tete: 6 });
    expect(lireVersionPage(doc)).toBe(3);
  });
});
