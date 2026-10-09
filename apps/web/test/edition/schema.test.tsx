import {
  eleverVersionPage,
  lireVersionPage,
  ouvrirDocumentPage,
  TABLE_DES_VERSIONS_PAGE,
  VERSION_PAGE_PRISE_EN_CHARGE,
} from "@notionlike/document";
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import {
  annuler,
  collerHtml,
  contenuLu,
  editeurMonte,
  monterEditeur,
  presser,
  retablir,
  taper,
  zoneDeSaisie,
} from "./aides-edition.tsx";

function paragraphe(texte: string): Y.XmlElement {
  const element = new Y.XmlElement("paragraph");
  element.insert(0, [new Y.XmlText(texte)]);
  return element;
}

function activer(nom: string): void {
  within(screen.getByRole("toolbar")).getByRole("button", { name: nom }).click();
}

describe("schéma et format du document de page", () => {
  it("F-003-AC22 les nœuds, les attributs de chaque nœud et les marques du schéma de l'éditeur sont ceux de la dernière ligne de la table des versions", () => {
    monterEditeur();
    const { schema } = editeurMonte();
    const ligne = TABLE_DES_VERSIONS_PAGE.at(-1);

    const noeuds = Object.fromEntries(
      Object.entries(schema.nodes)
        .map(([nom, type]): [string, string[]] => [nom, Object.keys(type.spec.attrs ?? {}).sort()])
        .sort(([a], [b]) => a.localeCompare(b)),
    );

    expect(noeuds).toEqual(ligne?.noeuds);
    expect(noeuds).toEqual({
      bulletList: [],
      doc: [],
      heading: ["level"],
      listItem: [],
      orderedList: ["start", "type"],
      paragraph: [],
      text: [],
    });
    expect(Object.keys(schema.marks)).toEqual(ligne?.marques);
    expect(Object.keys(schema.marks)).toEqual([]);
    expect(ligne?.typesPartages).toEqual([]);
    expect(VERSION_PAGE_PRISE_EN_CHARGE).toBe(ligne?.version);
    expect(VERSION_PAGE_PRISE_EN_CHARGE).toBe(1);
    expect(TABLE_DES_VERSIONS_PAGE.map(({ version }) => version)).toEqual([1]);
  });

  it("F-003-AC22 F-003-AC26 l'éditeur écrit dans le seul fragment fourni par la façade, instance du Y.XmlFragment d'apps/web", () => {
    const { doc, page } = monterEditeur();

    taper("texte");

    expect(page.contenu).toBeInstanceOf(Y.XmlFragment);
    expect(page.contenu.doc).toBe(doc);
    expect([...doc.share.keys()].sort()).toEqual(["contenu", "versions"]);
    expect(doc.getArray("versions").length).toBe(0);
    expect(page.contenu.toString()).toBe("<paragraph>texte</paragraph>");
  });

  it("F-003-AC17 titre de niveau 9 et attribut inconnu déjà dans le document : tout le contenu s'affiche, sans exception ni mise à jour", () => {
    const doc = new Y.Doc();
    const titre = new Y.XmlElement("heading");
    titre.setAttribute("level", 9 as never);
    titre.insert(0, [new Y.XmlText("neuf")]);
    const avecAttribut = paragraphe("texte");
    avecAttribut.setAttribute("foo", "bar");
    ouvrirDocumentPage(doc).contenu.insert(0, [titre, avecAttribut]);
    const avant = contenuLu(doc);

    const { misesAJour } = monterEditeur(doc);

    expect(misesAJour).toEqual([]);
    expect(contenuLu(doc)).toBe(avant);
    const zone = zoneDeSaisie();
    expect(zone?.textContent).toBe("neuftexte");
    expect(zone?.querySelector("h1, h2, h3, h4, h5, h6")?.textContent).toBe("neuf");
    expect(zone?.querySelector("p")?.textContent).toBe("texte");
    const marquees = within(screen.getByRole("toolbar"))
      .getAllByRole("button")
      .filter((bouton) => bouton.getAttribute("aria-pressed") === "true");
    expect(marquees).toEqual([]);
  });

  it("F-003-AC17 nœud et marque absents du schéma dans un document de version 1 : le reste du contenu s'affiche sans exception", () => {
    const doc = new Y.Doc();
    const inconnu = new Y.XmlElement("futureBlock");
    inconnu.insert(0, [new Y.XmlText("inconnu")]);
    const marque = new Y.XmlElement("paragraph");
    const texte = new Y.XmlText();
    marque.insert(0, [texte]);
    ouvrirDocumentPage(doc).contenu.insert(0, [
      paragraphe("avant"),
      inconnu,
      marque,
      paragraphe("après"),
    ]);
    texte.insert(0, "gras", { bold: true });

    expect(() => monterEditeur(doc)).not.toThrow();

    const paragraphes = [...(zoneDeSaisie()?.querySelectorAll("p") ?? [])].map(
      (p) => p.textContent,
    );
    expect(paragraphes).toContain("avant");
    expect(paragraphes).toContain("après");
    expect(zoneDeSaisie()?.querySelector("b, strong")).toBeNull();
  });

  it("F-003-AC32 saisie, barre de blocs, séquences, collage, annulation, rétablissement : la version lue reste 1 et seul le fragment du contenu est modifié", () => {
    const { doc, page } = monterEditeur();
    const typesModifies = new Set<unknown>();
    doc.on("afterTransaction", (transaction: Y.Transaction) => {
      for (const type of transaction.changedParentTypes.keys()) {
        let racine: { readonly _item: Y.Item | null } = type;
        while (racine._item !== null) {
          racine = racine._item.parent as { readonly _item: Y.Item | null };
        }
        typesModifies.add(racine);
      }
    });

    taper("# Titre");
    presser("Enter");
    taper("texte");
    activer("Titre 3");
    activer("Paragraphe");
    presser("Enter");
    taper("- un");
    presser("Enter");
    taper("deux");
    presser("Tab");
    presser("Enter");
    presser("Enter");
    presser("Enter");
    taper("1. premier");
    presser("Enter");
    presser("Enter");
    collerHtml("<h2>collé</h2><p><b>gras</b></p>");
    taper("fin");
    annuler();
    retablir();

    const lu = contenuLu(doc);
    for (const balise of ["<heading", "<paragraph>", "<bulletlist>", "<orderedlist"]) {
      expect(lu).toContain(balise);
    }
    expect(lu).toContain("<bulletlist><listitem><paragraph>deux</paragraph>");
    expect(lireVersionPage(doc)).toBe(1);
    expect(doc.getArray("versions").length).toBe(0);
    expect([...typesModifies]).toEqual([page.contenu]);
    expect(() => ouvrirDocumentPage(doc)).not.toThrow();
    // Témoin : une élévation, elle, modifie un autre type racine que le fragment.
    eleverVersionPage(doc, 2);
    expect(typesModifies.size).toBe(2);
  });
});
