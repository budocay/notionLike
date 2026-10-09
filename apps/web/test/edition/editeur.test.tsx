import { act, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import * as interfaceDeLEdition from "../../src/edition/index.ts";
import sourceDeLInterface from "../../src/edition/index.ts?raw";
import {
  ajouterParagraphe,
  annuler,
  contenuLu,
  editeurMonte,
  monterEditeur,
  piegerLeReseau,
  presser,
  recevoir,
  retablir,
  taper,
  zoneDeSaisie,
} from "./aides-edition.tsx";

let appelsReseau: string[] = [];

beforeEach(() => {
  appelsReseau = piegerLeReseau();
});

function listeDe(...elements: string[]): string {
  return `<bulletlist>${elements.join("")}</bulletlist>`;
}

function element(texte: string, sousListe = ""): string {
  return `<listitem><paragraph>${texte}</paragraph>${sousListe}</listitem>`;
}

describe("éditeur de page", () => {
  it("F-003-AC2 page vide : éditeur prêt à la saisie, aucune mise à jour Yjs au montage ni à la prise de focus", () => {
    const { doc, misesAJour } = monterEditeur();

    act(() => void editeurMonte().commands.focus());

    expect(zoneDeSaisie()?.getAttribute("contenteditable")).toBe("true");
    expect(misesAJour).toEqual([]);
    expect(contenuLu(doc)).toBe("");
    expect(editeurMonte().isEmpty).toBe(true);
  });

  it("F-003-AC7 le texte saisi s'inscrit dans le document de page à l'endroit du curseur", () => {
    const { doc } = monterEditeur();

    taper("Bonur");
    act(() => void editeurMonte().commands.setTextSelection(4));
    taper("jo");

    expect(contenuLu(doc)).toBe("<paragraph>Bonjour</paragraph>");
    expect(zoneDeSaisie()?.textContent).toBe("Bonjour");
  });

  it("F-003-AC7 Entrée dans un paragraphe puis dans un titre crée à la suite un paragraphe qui reçoit le curseur", () => {
    const { doc } = monterEditeur();

    taper("un");
    expect(presser("Enter")).toBe(true);
    taper("# Titre");
    expect(presser("Enter")).toBe(true);
    taper("deux");

    expect(contenuLu(doc)).toBe(
      '<paragraph>un</paragraph><heading level="1">Titre</heading><paragraph>deux</paragraph>',
    );
  });

  it.each([
    ["# ", '<heading level="1">texte</heading>'],
    ["## ", '<heading level="2">texte</heading>'],
    ["### ", '<heading level="3">texte</heading>'],
    ["- ", "<bulletlist><listitem><paragraph>texte</paragraph></listitem></bulletlist>"],
    [
      "1. ",
      '<orderedlist start="1"><listitem><paragraph>texte</paragraph></listitem></orderedlist>',
    ],
  ])(
    "F-003-AC9 la séquence « %s» en tête d'un paragraphe vide le transforme, sans rester dans le texte",
    (sequence, attendu) => {
      const { doc } = monterEditeur();

      taper(`${sequence}texte`);

      expect(contenuLu(doc)).toBe(attendu);
    },
  );

  it("F-003-AC9 une quatrième dièse ne donne aucun titre : le schéma s'arrête au niveau 3", () => {
    const { doc } = monterEditeur();

    taper("#### texte");

    expect(contenuLu(doc)).toBe("<paragraph>#### texte</paragraph>");
  });

  it("F-003-AC10 Entrée dans un élément non vide crée l'élément suivant ; dans un élément vide, sort de la liste", () => {
    const { doc } = monterEditeur();

    taper("- un");
    presser("Enter");
    taper("deux");
    expect(contenuLu(doc)).toBe(listeDe(element("un"), element("deux")));

    presser("Enter");
    presser("Enter");
    taper("après");

    expect(contenuLu(doc)).toBe(
      `${listeDe(element("un"), element("deux"))}<paragraph>après</paragraph>`,
    );
  });

  it("F-003-AC11 Tab imbrique l'élément sous le précédent, Maj+Tab le remonte, Tab dans le premier élément ne modifie rien", () => {
    const { doc, misesAJour } = monterEditeur();

    taper("- un");
    const avant = misesAJour.length;
    presser("Tab");
    expect(misesAJour).toHaveLength(avant);
    expect(contenuLu(doc)).toBe(listeDe(element("un")));

    presser("Enter");
    taper("deux");
    presser("Tab");
    expect(contenuLu(doc)).toBe(listeDe(element("un", listeDe(element("deux")))));

    presser("Tab", { shiftKey: true });
    expect(contenuLu(doc)).toBe(listeDe(element("un"), element("deux")));
  });

  it("F-003-AC12 Ctrl+Z défait la dernière modification locale, Ctrl+Maj+Z la refait, sans défaire une mise à jour reçue", () => {
    const { doc } = monterEditeur();
    taper("local");

    recevoir(doc, (replique) => ajouterParagraphe(replique, "reçu"));
    expect(contenuLu(doc)).toBe("<paragraph>local</paragraph><paragraph>reçu</paragraph>");

    expect(annuler()).toBe(true);
    expect(contenuLu(doc)).toBe("<paragraph>reçu</paragraph>");

    expect(retablir()).toBe(true);
    expect(contenuLu(doc)).toBe("<paragraph>local</paragraph><paragraph>reçu</paragraph>");
  });

  it("F-003-AC16 la zone de saisie est une zone de texte multiligne nommée « Contenu de la page »", () => {
    monterEditeur();

    const zone = screen.getByRole("textbox", { name: "Contenu de la page" });
    expect(zone).toBe(zoneDeSaisie());
    expect(zone.getAttribute("aria-multiline")).toBe("true");
  });

  it("F-003-AC27 l'interface du module d'édition n'exporte que EditeurDePage et ses propriétés, sans type de Tiptap", () => {
    expect(Object.keys(interfaceDeLEdition)).toEqual(["EditeurDePage"]);
    expect(sourceDeLInterface).not.toMatch(/tiptap|prosemirror/i);
    expect(sourceDeLInterface.match(/type \w+/g)).toEqual(["type ProprietesEditeurDePage"]);
  });

  it("F-003-AC21 saisie, séquences, listes, annulation : aucune requête réseau du module d'édition", () => {
    monterEditeur();

    taper("# Titre");
    presser("Enter");
    taper("- un");
    presser("Enter");
    taper("deux");
    presser("Tab");
    annuler();
    retablir();

    expect(appelsReseau).toEqual([]);
  });
});
