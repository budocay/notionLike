// Format du document de page : le schéma de l'éditeur est la dernière ligne de la table des
// versions, et l'éditeur n'écrit que dans le fragment du contenu (F-003-AC22).
import { TABLE_DES_VERSIONS_PAGE, VERSION_PAGE_PRISE_EN_CHARGE } from "@notionlike/document";
import { act } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import { inventaireDuContenu } from "../aides-facade-page.ts";
import {
  commande,
  entrerDansLEditeur,
  monterLEditeur,
  presser,
  schemaDeLEditeur,
  selectionnerLeBloc,
  taper,
} from "./aides-edition.tsx";

const derniereLigne = TABLE_DES_VERSIONS_PAGE[TABLE_DES_VERSIONS_PAGE.length - 1];

describe("schéma de l'éditeur", () => {
  it("F-003-AC22 les nœuds, les attributs de chaque nœud et les marques du schéma de l'éditeur sont exactement ceux de la dernière ligne de la table des versions, dont le numéro est la version prise en charge", () => {
    monterLEditeur();

    const schema = schemaDeLEditeur();

    expect(schema.noeuds).toEqual(derniereLigne?.noeuds);
    expect(schema.marques).toEqual(derniereLigne?.marques);
    expect(schema.noeuds.heading).toEqual(["level"]);
    expect(schema.noeuds.orderedList).toEqual(["start", "type"]);
    expect(schema.marques).toEqual([]);
    expect(derniereLigne?.version).toBe(VERSION_PAGE_PRISE_EN_CHARGE);
    expect(derniereLigne?.typesPartages).toEqual([]);
  });

  it("F-003-AC22 l'éditeur écrit son contenu dans un seul type racine, un fragment XML, dont les nœuds, les attributs et les marques sont ceux du schéma", () => {
    const { doc, page } = monterLEditeur();
    entrerDansLEditeur();

    taper("# Titre");
    presser("Enter");
    taper("- puce");
    presser("Enter");
    taper("imbriquée");
    presser("Tab");
    presser("Enter");
    presser("Enter");
    presser("Enter");
    taper("numéro");
    selectionnerLeBloc();
    act(() => commande("Liste numérotée").click());

    const inventaire = inventaireDuContenu(doc);
    const ecrits = [...doc.share].filter(([, type]) => type._start !== null || type._map.size > 0);
    expect(ecrits.map(([, type]) => type)).toEqual([page.contenu]);
    expect(page.contenu).toBeInstanceOf(Y.XmlFragment);
    expect(Object.keys(inventaire.noeuds)).toEqual([
      "bulletList",
      "heading",
      "listItem",
      "orderedList",
      "paragraph",
    ]);
    for (const [noeud, attributs] of Object.entries(inventaire.noeuds)) {
      expect(derniereLigne?.noeuds[noeud], noeud).toEqual(expect.arrayContaining([...attributs]));
    }
    expect(inventaire.noeuds.heading).toEqual(["level"]);
    expect(inventaire.marques).toEqual([]);
  });
});
