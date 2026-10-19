// Collage et texte balisé : le contenu riche passe par le schéma, rien n'est interprété
// (F-003-AC13, AC20). Depuis F-028, du presse-papiers ne survivent que les blocs, le texte, les
// trois marques et l'adresse normalisée d'un lien (F-028 H8).
import { TABLE_DES_VERSIONS_PAGE } from "@notionlike/document";
import { describe, expect, it } from "vitest";

import { contenuLu, inventaireDuContenu } from "../aides-facade-page.ts";
import {
  collerDuHtml,
  collerDuTexte,
  collerParLeNavigateur,
  entrerDansLEditeur,
  laisserRelireLaSelection,
  monterLEditeur,
  placerDansLeNavigateurApres,
  selectionnerLeTexte,
  selectionVueParLEditeur,
  taper,
  zoneDeSaisie,
} from "./aides-edition.tsx";

const derniereLigne = TABLE_DES_VERSIONS_PAGE[TABLE_DES_VERSIONS_PAGE.length - 1];

const CONTENU_RICHE = [
  '<h1 style="color:red" class="titre" data-origine="ailleurs" onclick="alert(1)">Grand titre</h1>',
  '<p style="font-size:40px"><strong>gras</strong> <em>italique</em> <a href="https://exemple.invalid" onclick="alert(1)">lien</a> <code>code</code></p>',
  "<h5>titre de niveau cinq</h5>",
  '<ul class="liste"><li>puce</li></ul>',
  '<ol start="3" type="a" data-x="y"><li>numéro</li></ol>',
  "<blockquote>citation</blockquote>",
  "<table><tbody><tr><td>cellule</td></tr></tbody></table>",
  "<pre>bloc de code</pre>",
  '<img src="x" onerror="alert(1)" alt="image">',
  "<script>alert(1)</script>",
  "<style>p { color: red }</style>",
  '<iframe src="https://exemple.invalid"></iframe>',
].join("");

describe("collage d'un contenu riche", () => {
  it("F-003-AC13 F-028-AC13 seuls les nœuds, les attributs et les marques de la dernière ligne de la table des versions entrent dans le document ; le reste est réduit à son texte, sans balise, style ni script", () => {
    const { doc } = monterLEditeur();
    entrerDansLEditeur();

    collerDuHtml(CONTENU_RICHE);

    const inventaire = inventaireDuContenu(doc);
    const admis = derniereLigne?.noeuds ?? {};
    expect(Object.keys(inventaire.noeuds).length).toBeGreaterThan(0);
    for (const [noeud, attributs] of Object.entries(inventaire.noeuds)) {
      expect(Object.keys(admis), noeud).toContain(noeud);
      expect(admis[noeud], noeud).toEqual(expect.arrayContaining([...attributs]));
    }
    expect(inventaire.marques).toEqual(["bold", "italic", "link"]);
    expect(derniereLigne?.marques).toEqual(expect.arrayContaining([...inventaire.marques]));
    expect(inventaire.noeuds).toEqual({
      bulletList: [],
      // F-005 : le `pre` collé devient un bloc code sans langage (F-005-AC7).
      codeBlock: [],
      heading: ["level"],
      listItem: [],
      orderedList: ["start", "type"],
      paragraph: [],
    });
    const contenu = contenuLu(doc);
    for (const texte of ["Grand titre", "gras", "italique", "lien", "code", "puce", "numéro"]) {
      expect(contenu, texte).toContain(texte);
    }
    for (const texte of ["titre de niveau cinq", "citation", "cellule", "bloc de code"]) {
      expect(contenu, texte).toContain(texte);
    }
    expect(contenu).not.toMatch(/style|class|onclick|onerror|data-|alert|script|iframe|src=/);
    expect([...contenu.matchAll(/href="[^"]*"/g)].map(([attribut]) => attribut)).toEqual([
      'href="https://exemple.invalid/"',
    ]);
    expect(contenu).toContain('<orderedlist start="3" type="a">');
  });

  it("F-003-AC13 le titre de niveau cinq collé n'entre pas comme un niveau hors du schéma : aucun titre du document n'a un niveau hors de 1 à 3", () => {
    const { doc } = monterLEditeur();
    entrerDansLEditeur();

    collerDuHtml(CONTENU_RICHE);

    const niveaux = [...contenuLu(doc).matchAll(/<heading level="(\d+)"/g)].map(([, niveau]) =>
      Number(niveau),
    );
    expect(niveaux.length).toBeGreaterThan(0);
    expect(niveaux.filter((niveau) => niveau < 1 || niveau > 3)).toEqual([]);
  });

  it("F-003-AC13 F-003-AC20 rien de ce qui est collé n'est interprété dans la page : ni script, ni image, ni cadre, ni style, ni gestionnaire d'événement", () => {
    monterLEditeur();
    entrerDansLEditeur();

    collerDuHtml(CONTENU_RICHE);

    const zone = zoneDeSaisie();
    expect(zone.querySelectorAll("script, style, img, iframe, table")).toHaveLength(0);
    expect(zone.querySelectorAll("[style], [onclick], [onerror], [class]")).toHaveLength(0);
    // F-028-AC13 F-028-AC16 : le seul lien collé porte sa forme normalisée et les attributs imposés.
    expect(
      [...zone.querySelectorAll("[href]")].map((lien) =>
        lien.getAttributeNames().map((nom) => `${nom}=${lien.getAttribute(nom) ?? ""}`),
      ),
    ).toEqual([["href=https://exemple.invalid/", "rel=noopener noreferrer", "target=_blank"]]);
    expect(zone.querySelector("h1")?.textContent).toBe("Grand titre");
  });
});

describe("texte qui contient du balisage", () => {
  const BALISAGE = '<b>gras</b><script>alert(1)</script><img src=x onerror="alert(1)">';

  it("F-003-AC20 un texte saisi qui contient du balisage HTML ou un script est affiché comme du texte", () => {
    const { doc } = monterLEditeur();
    entrerDansLEditeur();

    taper(BALISAGE);

    const zone = zoneDeSaisie();
    expect(zone.textContent).toBe(BALISAGE);
    expect(zone.querySelectorAll("b, script, img")).toHaveLength(0);
    expect(inventaireDuContenu(doc).noeuds).toEqual({ paragraph: [] });
  });

  it("F-003-AC20 un texte collé qui contient du balisage HTML ou un script est affiché comme du texte", () => {
    const { doc } = monterLEditeur();
    entrerDansLEditeur();

    collerDuTexte(BALISAGE);

    const zone = zoneDeSaisie();
    expect(zone.textContent).toBe(BALISAGE);
    expect(zone.querySelectorAll("b, script, img")).toHaveLength(0);
    expect(inventaireDuContenu(doc).noeuds).toEqual({ paragraph: [] });
  });
});

// F-028-AC30 sous macOS : Chromium livre `selectionchange` après un collage qui suit de près la
// touche Fin, et l'éditeur ne relit la sélection du navigateur qu'à cet événement.
describe("collage juste après un déplacement du curseur", () => {
  it("F-028-AC30 un collage reçu avant que l'éditeur n'ait relu la sélection du navigateur s'insère au curseur affiché, sans remplacer l'ancienne sélection", () => {
    const { doc } = monterLEditeur();
    entrerDansLEditeur();
    taper("voir le site");
    selectionnerLeTexte("site");
    placerDansLeNavigateurApres("voir le site");
    const vueAvantLeCollage = selectionVueParLEditeur();

    collerParLeNavigateur(" collé");

    expect(vueAvantLeCollage).toBe("site");
    expect(contenuLu(doc)).toBe("<paragraph>voir le site collé</paragraph>");
  });

  it("F-028-AC30 témoin : le même curseur, une fois relu par l'éditeur à son événement, reçoit le même collage", async () => {
    const { doc } = monterLEditeur();
    entrerDansLEditeur();
    taper("voir le site");
    selectionnerLeTexte("site");
    placerDansLeNavigateurApres("voir le site");
    await laisserRelireLaSelection();
    const vueAvantLeCollage = selectionVueParLEditeur();

    collerParLeNavigateur(" collé");

    expect(vueAvantLeCollage).toBe("");
    expect(contenuLu(doc)).toBe("<paragraph>voir le site collé</paragraph>");
  });
});
