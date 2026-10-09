import { TABLE_DES_VERSIONS_PAGE } from "@notionlike/document";
import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import {
  annuler,
  contenuLu,
  editeurMonte,
  monterEditeur,
  presser,
  retablir,
  taper,
  zoneDeSaisie,
} from "./aides-edition.tsx";

const NOMS = [
  "Paragraphe",
  "Titre 1",
  "Titre 2",
  "Titre 3",
  "Liste à puces",
  "Liste numérotée",
] as const;
type Nom = (typeof NOMS)[number];

function barre(): HTMLElement {
  return screen.getByRole("toolbar", { name: "Type de bloc" });
}

function commande(nom: Nom): HTMLElement {
  return within(barre()).getByRole("button", { name: nom });
}

function activer(nom: Nom): void {
  act(() => commande(nom).click());
}

function commandesMarquees(): string[] {
  return within(barre())
    .getAllByRole("button")
    .filter((bouton) => bouton.getAttribute("aria-pressed") === "true")
    .map((bouton) => bouton.textContent ?? "");
}

function placerLeCurseurDans(texte: string): void {
  const editeur = editeurMonte();
  let position = -1;
  editeur.state.doc.descendants((noeud, debut) => {
    if (noeud.isText && noeud.text === texte) {
      position = debut + 1;
    }
  });
  act(() => void editeur.commands.setTextSelection(position));
}

/** Laisse passer deux images : tout travail remis à « l'image suivante » a eu lieu. */
async function deuxImagesPlusTard(): Promise<void> {
  await act(
    () =>
      new Promise<void>((resoudre) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resoudre()));
      }),
  );
}

function item(texte: string, suite = ""): string {
  return `<listitem><paragraph>${texte}</paragraph>${suite}</listitem>`;
}

describe("barre de blocs", () => {
  it("F-003-AC16 six commandes, boutons natifs nommés en français, atteignables au clavier, chacune avec son état", () => {
    monterEditeur();

    const boutons = within(barre()).getAllByRole("button");

    expect(boutons.map((bouton) => bouton.textContent)).toEqual([...NOMS]);
    for (const bouton of boutons) {
      expect(bouton.tagName).toBe("BUTTON");
      expect(bouton.getAttribute("type")).toBe("button");
      expect(bouton.hasAttribute("disabled")).toBe(false);
      expect(bouton.getAttribute("tabindex")).toBeNull();
      expect(["true", "false"]).toContain(bouton.getAttribute("aria-pressed"));
    }
    expect(commandesMarquees()).toEqual(["Paragraphe"]);
  });

  it.each<[Nom, string]>([
    ["Titre 1", '<heading level="1">texte</heading>'],
    ["Titre 2", '<heading level="2">texte</heading>'],
    ["Titre 3", '<heading level="3">texte</heading>'],
    ["Liste à puces", `<bulletlist>${item("texte")}</bulletlist>`],
    ["Liste numérotée", `<orderedlist start="1">${item("texte")}</orderedlist>`],
  ])(
    "F-003-AC8 « %s » donne ce type au paragraphe courant en conservant son texte, et se marque ; « Paragraphe » le lui rend",
    (nom, attendu) => {
      const { doc } = monterEditeur();
      taper("texte");

      activer(nom);

      expect(contenuLu(doc)).toBe(attendu);
      expect(commandesMarquees()).toEqual([nom]);

      activer("Paragraphe");

      expect(contenuLu(doc)).toBe("<paragraph>texte</paragraph>");
      expect(commandesMarquees()).toEqual(["Paragraphe"]);
    },
  );

  it("F-003-AC8 d'un type à l'autre sans repasser par le paragraphe : titre, liste à puces, liste numérotée, titre", () => {
    const { doc } = monterEditeur();
    taper("texte");

    activer("Titre 2");
    activer("Liste à puces");
    expect(contenuLu(doc)).toBe(`<bulletlist>${item("texte")}</bulletlist>`);

    activer("Liste numérotée");
    expect(contenuLu(doc)).toBe(`<orderedlist start="1">${item("texte")}</orderedlist>`);

    activer("Titre 3");
    expect(contenuLu(doc)).toBe('<heading level="3">texte</heading>');

    activer("Titre 3");
    expect(contenuLu(doc)).toBe('<heading level="3">texte</heading>');
  });

  it("F-003-AC8 la commande marquée suit le bloc où se trouve le curseur, et seul ce bloc change de type", () => {
    const { doc } = monterEditeur();
    taper("# Titre");
    presser("Enter");
    taper("corps");
    presser("Enter");
    taper("- puce");
    expect(commandesMarquees()).toEqual(["Liste à puces"]);

    placerLeCurseurDans("Titre");
    expect(commandesMarquees()).toEqual(["Titre 1"]);

    placerLeCurseurDans("corps");
    expect(commandesMarquees()).toEqual(["Paragraphe"]);

    activer("Titre 2");

    expect(contenuLu(doc)).toBe(
      `<heading level="1">Titre</heading><heading level="2">corps</heading><bulletlist>${item("puce")}</bulletlist>`,
    );
    expect(commandesMarquees()).toEqual(["Titre 2"]);
  });

  it("F-003-AC8 un élément imbriqué sort de toutes ses listes en devenant paragraphe, texte conservé", () => {
    const { doc } = monterEditeur();
    taper("- un");
    presser("Enter");
    taper("deux");
    presser("Tab");
    expect(commandesMarquees()).toEqual(["Liste à puces"]);

    activer("Paragraphe");

    expect(contenuLu(doc)).toBe(
      `<bulletlist>${item("un")}</bulletlist><paragraph>deux</paragraph>`,
    );
    expect(commandesMarquees()).toEqual(["Paragraphe"]);
  });

  it("F-003-AC16 une commande se déclenche au clavier seul : tabulation jusqu'au bouton, puis Entrée ou Espace", async () => {
    const utilisateur = userEvent.setup();
    const { doc } = monterEditeur();
    taper("texte");

    act(() => commande("Paragraphe").focus());
    await utilisateur.tab();
    expect(document.activeElement).toBe(commande("Titre 1"));
    await utilisateur.keyboard("{Enter}");

    expect(contenuLu(doc)).toBe('<heading level="1">texte</heading>');
    expect(commande("Titre 1").getAttribute("aria-pressed")).toBe("true");

    act(() => commande("Liste à puces").focus());
    await utilisateur.keyboard(" ");

    expect(contenuLu(doc)).toBe(`<bulletlist>${item("texte")}</bulletlist>`);
  });

  // Le focus rendu à la zone de saisie ne doit pas l'être « à l'image suivante » : différé, il
  // reprenait le focus au bouton rejoint entre-temps, et la touche partait dans le texte.
  it("F-003-AC16 une commande rend le focus à la zone de saisie aussitôt, et ne le reprend plus au bouton rejoint ensuite", async () => {
    const utilisateur = userEvent.setup();
    const { doc } = monterEditeur();
    taper("texte");

    act(() => commande("Titre 1").focus());
    await utilisateur.keyboard("{Enter}");

    expect(contenuLu(doc)).toBe('<heading level="1">texte</heading>');
    expect(document.activeElement).toBe(zoneDeSaisie());

    act(() => commande("Liste à puces").focus());
    await deuxImagesPlusTard();

    expect(document.activeElement).toBe(commande("Liste à puces"));
    await utilisateur.keyboard(" ");

    expect(contenuLu(doc)).toBe(`<bulletlist>${item("texte")}</bulletlist>`);
  });

  it("F-003-AC2 le texte d'invite s'affiche tant que l'éditeur est vide, hors du contenu et hors du document", () => {
    const { doc, misesAJour } = monterEditeur();

    const invite = screen.getByText(/Écrivez ici/);
    expect(zoneDeSaisie()?.contains(invite)).toBe(false);
    expect(invite.getAttribute("aria-hidden")).toBe("true");
    expect(misesAJour).toEqual([]);
    expect(contenuLu(doc)).toBe("");

    taper("a");
    expect(screen.queryByText(/Écrivez ici/)).toBeNull();
    expect(contenuLu(doc)).toBe("<paragraph>a</paragraph>");

    annuler();
    expect(screen.getByText(/Écrivez ici/)).toBeDefined();
  });

  it("F-003-AC17 F-003-AC12 les six commandes n'écrivent que des nœuds et des attributs de la table des versions, et s'annulent", () => {
    const { doc } = monterEditeur();
    const ligne = TABLE_DES_VERSIONS_PAGE.at(-1);
    const balises = new Set(Object.keys(ligne?.noeuds ?? {}).map((nom) => nom.toLowerCase()));
    const attributs = new Set(Object.values(ligne?.noeuds ?? {}).flat());
    taper("texte");

    for (const nom of NOMS) {
      activer(nom);
      const lu = contenuLu(doc);
      for (const [, balise] of lu.matchAll(/<([a-z]+)/g)) {
        expect(balises.has(balise ?? ""), `${nom} : ${lu}`).toBe(true);
      }
      for (const [, attribut] of lu.matchAll(/ ([a-z]+)="/g)) {
        expect(attributs.has(attribut ?? ""), `${nom} : ${lu}`).toBe(true);
      }
      expect(lu).not.toMatch(/level="[^123]"/);
    }
    expect(contenuLu(doc)).toBe(`<orderedlist start="1">${item("texte")}</orderedlist>`);

    annuler();

    // L'historique de la liaison regroupe les modifications rapprochées : tout est défait.
    expect(contenuLu(doc)).not.toContain("orderedlist");

    retablir();

    expect(contenuLu(doc)).toBe(`<orderedlist start="1">${item("texte")}</orderedlist>`);
  });
});
