// Couture de la façade surveillée (F-019-AC17) : chaque membre de `DocumentTable` est classé
// « interceptée » ou « transmise », et le test échoue si un membre n'est pas classé.
import { creerDocumentTable, type DocumentTable } from "@notionlike/document";
import { describe, expect, it, vi } from "vitest";

import {
  CLASSEMENT_DE_LA_FACADE,
  facadeSurveillee,
} from "../../src/vues-de-table/use-affichage.ts";

const REELLE = creerDocumentTable();
const CLES = Object.keys(REELLE).sort();

describe("façade surveillée (F-019-AC17)", () => {
  it("F-019-AC17 toute clé de DocumentTable est classée, et rien d'autre n'est classé", () => {
    expect(Object.keys(CLASSEMENT_DE_LA_FACADE).sort()).toEqual(CLES);
  });

  it("F-019-AC17 la façade rendue porte exactement les clés de DocumentTable", () => {
    const facade = facadeSurveillee(REELLE, { current: dernier() }, () => undefined);
    expect(Object.keys(facade).sort()).toEqual(CLES);
  });

  it("F-019-AC17 une clé transmise appelle la façade de la session avec les mêmes arguments, rend son résultat, sans figer", () => {
    const figer = vi.fn();
    const { table, appels } = fausse();
    const facade = facadeSurveillee(table, { current: dernier() }, figer);
    const transmises = CLES.filter(
      (cle) => CLASSEMENT_DE_LA_FACADE[cle as keyof DocumentTable] === "transmise",
    );
    expect(transmises.length).toBeGreaterThan(0);
    for (const cle of transmises) {
      const membre = facade[cle as keyof DocumentTable];
      if (typeof membre === "function") {
        const donnes = ["a", "b", 3].slice(
          0,
          (REELLE as unknown as Record<string, () => void>)[cle]?.length,
        );
        const resultat = (membre as (...arguments_: unknown[]) => unknown)(...donnes);
        expect(appels.get(cle), cle).toEqual([donnes]);
        expect(resultat, cle).toBe(`rendu:${cle}`);
      } else {
        expect(membre).toBe(table[cle as keyof DocumentTable]);
      }
    }
    expect(figer).not.toHaveBeenCalled();
  });

  it("F-019-AC17 une clé interceptée appelle quand même la façade de la session", () => {
    const { table, appels } = fausse();
    const facade = facadeSurveillee(table, { current: dernier() }, () => undefined);
    facade.ecrireCellule("l", "c", "v");
    facade.creerLigne(new Map(), 1);
    facade.deplacerLigne("l", 0);
    expect(appels.get("ecrireCellule")).toEqual([["l", "c", "v"]]);
    expect(appels.get("creerLigne")).toEqual([[expect.any(Map), 1]]);
    expect(appels.get("deplacerLigne")).toEqual([["l", 0]]);
    expect(
      Object.entries(CLASSEMENT_DE_LA_FACADE)
        .filter(([, classe]) => classe === "interceptee")
        .map(([cle]) => cle)
        .sort(),
    ).toEqual(["creerLigne", "deplacerLigne", "ecrireCellule"]);
  });
});

function dernier() {
  return {
    lecture: { colonnes: [], lignes: [] },
    definition: { filtres: [], tris: [] },
    ids: [],
    figees: undefined,
  };
}

// Une table dont chaque fonction note ses arguments et rend `rendu:<clé>`.
function fausse(): { table: DocumentTable; appels: Map<string, unknown[][]> } {
  const appels = new Map<string, unknown[][]>();
  const table: Record<string, unknown> = {};
  for (const cle of CLES) {
    if (typeof (REELLE as unknown as Record<string, unknown>)[cle] === "function") {
      table[cle] = (...arguments_: unknown[]) => {
        appels.set(cle, [...(appels.get(cle) ?? []), arguments_]);
        return `rendu:${cle}`;
      };
    } else {
      table[cle] = (REELLE as unknown as Record<string, unknown>)[cle];
    }
  }
  return { table: table as unknown as DocumentTable, appels };
}
