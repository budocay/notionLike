// Section `filtres-tris` des réglages de vue (F-019-AC20, AC22, AC25), au niveau des fonctions : la
// lecture d'une section mal formée est vide et sans exception, les limites sont tenues, l'écriture
// garde les clés inconnues et ne réécrit que sa section.
import { describe, expect, it } from "vitest";

import {
  LIMITE_DE_FILTRES,
  LIMITE_DE_TRIS,
  LIMITE_DE_VALEUR,
} from "../../src/vues-de-table/definition.ts";
import {
  definitionLue,
  lireLesReglages,
  SECTION_FILTRES_TRIS,
  sectionDesFiltresEtTris,
} from "../../src/vues-de-table/reglages.ts";
import { definition } from "./aides-definition.ts";

const FILTRE = { colonne: "c", operateur: "contient", valeur: "x" } as const;

describe("lecture de la section filtres-tris (F-019-AC20, AC25)", () => {
  it("F-019-AC20 une section bien formée est lue telle quelle", () => {
    const section = {
      filtres: [
        FILTRE,
        { colonne: "n", operateur: "egal", valeur: 3 },
        { colonne: "d", operateur: "est-vide" },
      ],
      tris: [{ colonne: "c", sens: "decroissant" }],
    };
    expect(definitionLue(section)).toEqual({
      filtres: [
        FILTRE,
        { colonne: "n", operateur: "egal", valeur: 3 },
        { colonne: "d", operateur: "est-vide" },
      ],
      tris: [{ colonne: "c", sens: "decroissant" }],
    });
  });

  it.each([
    ["une chaîne", "x"],
    ["un tableau", []],
    ["des filtres qui ne sont pas une liste", { filtres: {} }],
    ["un filtre qui n'est pas un objet", { filtres: ["x"] }],
    ["un opérateur inconnu", { filtres: [{ colonne: "c", operateur: "ressemble", valeur: "x" }] }],
    ["une colonne qui n'est pas un texte", { filtres: [{ colonne: 3, operateur: "est-vide" }] }],
    ["une valeur booléenne", { filtres: [{ colonne: "c", operateur: "est", valeur: true }] }],
    [
      "une valeur infinie",
      { tris: [], filtres: [{ colonne: "c", operateur: "egal", valeur: Infinity }] },
    ],
    ["un sens inconnu", { tris: [{ colonne: "c", sens: "haut" }] }],
    [
      "une colonne triée deux fois",
      {
        tris: [
          { colonne: "c", sens: "croissant" },
          { colonne: "c", sens: "decroissant" },
        ],
      },
    ],
    ["un bon filtre et un mauvais", { filtres: [FILTRE, { colonne: "c" }] }],
  ])("F-019-AC20 une section mal formée (%s) est lue vide, sans exception", (_, section) => {
    expect(definitionLue(section)).toEqual(definition());
  });

  it("F-019-AC25 la section qui dépasse une limite est lue comme mal formée", () => {
    const filtres = (nombre: number) =>
      Array.from({ length: nombre }, (_, i) => ({
        colonne: `c${String(i)}`,
        operateur: "est-vide",
      }));
    const tris = (nombre: number) =>
      Array.from({ length: nombre }, (_, i) => ({ colonne: `c${String(i)}`, sens: "croissant" }));
    expect(definitionLue({ filtres: filtres(LIMITE_DE_FILTRES) }).filtres).toHaveLength(
      LIMITE_DE_FILTRES,
    );
    expect(definitionLue({ filtres: filtres(LIMITE_DE_FILTRES + 1) }).filtres).toEqual([]);
    expect(definitionLue({ tris: tris(LIMITE_DE_TRIS) }).tris).toHaveLength(LIMITE_DE_TRIS);
    expect(definitionLue({ tris: tris(LIMITE_DE_TRIS + 1) }).tris).toEqual([]);
    const valeur = (longueur: number) => ({
      filtres: [{ colonne: "c", operateur: "contient", valeur: "v".repeat(longueur) }],
    });
    expect(definitionLue(valeur(LIMITE_DE_VALEUR)).filtres).toHaveLength(1);
    expect(definitionLue(valeur(LIMITE_DE_VALEUR + 1)).filtres).toEqual([]);
  });

  it("F-019-AC20 les réglages lus par le code de F-018 ne changent pas : la section n'y entre pas", () => {
    const sections = {
      vue: { active: "tableau" },
      tableau: { largeurs: { a: 300 } },
      [SECTION_FILTRES_TRIS]: { filtres: [FILTRE] },
    };
    expect(lireLesReglages(sections, ["tableau"])).toEqual({
      vueActive: "tableau",
      largeurs: new Map([["a", 300]]),
    });
  });
});

describe("écriture de la section filtres-tris (F-019-AC20, AC22)", () => {
  it("F-019-AC22 la section garde les clés inconnues, retire chaque liste vide, et disparaît quand il ne reste rien", () => {
    const lue = { filtres: [FILTRE], futur: { a: 1 } };
    expect(
      sectionDesFiltresEtTris(definition([], [{ colonne: "c", sens: "croissant" }]), lue),
    ).toEqual({
      futur: { a: 1 },
      tris: [{ colonne: "c", sens: "croissant" }],
    });
    expect(sectionDesFiltresEtTris(definition(), lue)).toEqual({ futur: { a: 1 } });
    expect(sectionDesFiltresEtTris(definition(), { filtres: [FILTRE] })).toBeUndefined();
    expect(sectionDesFiltresEtTris(definition(), undefined)).toBeUndefined();
    expect(sectionDesFiltresEtTris(definition(), "illisible")).toBeUndefined();
  });

  it("F-019-AC22 ce qui est écrit est relu à l'identique, une valeur non encore saisie comprise", () => {
    const voulue = definition(
      [
        FILTRE,
        { colonne: "c", operateur: "est", valeur: undefined },
        { colonne: "n", operateur: "egal", valeur: 0 },
      ],
      [{ colonne: "n", sens: "decroissant" }],
    );
    const ecrite = JSON.parse(
      JSON.stringify(sectionDesFiltresEtTris(voulue, undefined)),
    ) as unknown;
    expect(definitionLue(ecrite).tris).toEqual(voulue.tris);
    expect(definitionLue(ecrite).filtres.map(({ valeur }) => valeur)).toEqual(["x", undefined, 0]);
  });
});
