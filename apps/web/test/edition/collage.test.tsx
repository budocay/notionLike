import { TABLE_DES_VERSIONS_PAGE } from "@notionlike/document";
import { beforeEach, describe, expect, it } from "vitest";
import * as Y from "yjs";

import {
  collerHtml,
  collerTexte,
  contenuLu,
  monterEditeur,
  piegerLeReseau,
  taper,
  zoneDeSaisie,
} from "./aides-edition.tsx";

const CONTENU_RICHE =
  '<h2 style="color:red" onclick="piege()" class="x" data-id="7">Titre <b>gras</b> <i>italique</i></h2>' +
  "<h5>cinq</h5>" +
  '<p style="font-size:40px"><a href="javascript:piege()">lien</a><img src="x" onerror="piege()"> et <code>code</code></p>' +
  "<script>window.piege = 1</script><style>p { color: red }</style>" +
  "<blockquote>cité</blockquote><table><tr><td>cellule</td></tr></table>" +
  '<ol start="3" type="a"><li>trois</li></ol><ul><li>puce<ul><li>imbriquée</li></ul></li></ul>';

let appelsReseau: string[] = [];

beforeEach(() => {
  appelsReseau = piegerLeReseau();
});

interface Releve {
  readonly noeuds: Set<string>;
  readonly attributs: Set<string>;
  readonly marques: Set<string>;
}

// Parcourt le fragment Yjs lui-même : ce qui est inscrit, pas ce que l'éditeur affiche.
function releverLeDocument(doc: Y.Doc): Releve {
  const releve: Releve = { noeuds: new Set(), attributs: new Set(), marques: new Set() };
  const visiter = (noeud: unknown): void => {
    if (noeud instanceof Y.XmlText) {
      releve.noeuds.add("text");
      for (const morceau of noeud.toDelta() as { attributes?: Record<string, unknown> }[]) {
        Object.keys(morceau.attributes ?? {}).forEach((marque) => releve.marques.add(marque));
      }
    } else if (noeud instanceof Y.XmlElement) {
      releve.noeuds.add(noeud.nodeName);
      Object.keys(noeud.getAttributes()).forEach((nom) =>
        releve.attributs.add(`${noeud.nodeName}.${nom}`),
      );
      noeud.toArray().forEach(visiter);
    }
  };
  doc.getXmlFragment("contenu").toArray().forEach(visiter);
  return releve;
}

describe("collage et texte balisé", () => {
  it("F-003-AC13 un contenu riche collé ne laisse dans le document que des nœuds et des attributs de la dernière ligne de la table des versions, et aucune marque", () => {
    const { doc } = monterEditeur();
    const ligne = TABLE_DES_VERSIONS_PAGE.at(-1);
    const noeudsAdmis = new Set(Object.keys(ligne?.noeuds ?? {}));
    const attributsAdmis = new Set(
      Object.entries(ligne?.noeuds ?? {}).flatMap(([noeud, noms]) =>
        noms.map((nom) => `${noeud}.${nom}`),
      ),
    );

    collerHtml(CONTENU_RICHE);

    const releve = releverLeDocument(doc);
    expect([...releve.noeuds].filter((nom) => !noeudsAdmis.has(nom))).toEqual([]);
    expect([...releve.attributs].filter((nom) => !attributsAdmis.has(nom))).toEqual([]);
    expect([...releve.marques]).toEqual([]);
    expect(ligne?.marques).toEqual([]);
    expect([...releve.noeuds].sort()).toEqual([
      "bulletList",
      "heading",
      "listItem",
      "orderedList",
      "paragraph",
      "text",
    ]);
  });

  it("F-003-AC13 ce que le schéma décrit est conservé, le reste est réduit à son texte : ni balise, ni style, ni script", () => {
    const { doc } = monterEditeur();

    collerHtml(CONTENU_RICHE);

    const lu = contenuLu(doc);
    expect(lu).toContain('<heading level="2">Titre gras italique</heading>');
    expect(lu).toContain("<paragraph>cinq</paragraph>");
    expect(lu).toContain("<paragraph>lien et code</paragraph>");
    expect(lu).toContain("cité");
    expect(lu).toContain("cellule");
    expect(lu).toMatch(
      /<orderedlist start="3"( type="a")?><listitem><paragraph>trois<\/paragraph>/,
    );
    expect(lu).toContain(
      "<bulletlist><listitem><paragraph>puce</paragraph><bulletlist><listitem><paragraph>imbriquée</paragraph></listitem></bulletlist></listitem></bulletlist>",
    );
    expect(lu).not.toMatch(
      /style|onclick|onerror|javascript|script|piege|color|class|data-id|href/,
    );
    const zone = zoneDeSaisie();
    expect(zone?.querySelector("script, style, img, a, b, i, code, table, blockquote")).toBeNull();
    expect(zone?.querySelector("[style], [onclick], [onerror], [class='x']")).toBeNull();
    expect("piege" in window).toBe(false);
  });

  it("F-003-AC20 un texte saisi ou collé fait de balisage et de script s'affiche comme du texte, sans être interprété", () => {
    const { doc } = monterEditeur();
    const saisi = '<b>gras</b><script>window.piege = 1</script><img src=x onerror="piege()">';
    const colle = "<h1>pas un titre</h1><i>pas d'italique</i>";

    taper(saisi);
    collerTexte(colle);

    const zone = zoneDeSaisie();
    expect(zone?.textContent).toBe(saisi + colle);
    expect(zone?.querySelector("b, script, img, h1, i")).toBeNull();
    expect("piege" in window).toBe(false);
    expect(doc.getXmlFragment("contenu").toArray()).toHaveLength(1);
    expect(releverLeDocument(doc).noeuds).toEqual(new Set(["paragraph", "text"]));
  });

  it("F-003-AC21 coller un contenu riche qui cite des adresses n'émet aucune requête réseau", () => {
    monterEditeur();

    collerHtml(
      '<p><img src="https://exemple.invalid/a.png"><a href="https://exemple.invalid/">lien</a></p>' +
        '<link rel="stylesheet" href="https://exemple.invalid/s.css"><iframe src="https://exemple.invalid/"></iframe>',
    );
    collerTexte("https://exemple.invalid/");

    expect(appelsReseau).toEqual([]);
    expect(zoneDeSaisie()?.querySelector("img, a, link, iframe")).toBeNull();
  });
});
