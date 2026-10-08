import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { BORNE_BASSE, BORNE_HAUTE, rangEntre, rangsCroissantsEntre } from "../src/rang.ts";
import { GRAINE, NOMBRE_EXECUTIONS } from "./aides.ts";

const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const RANG_VALIDE = /^[0-9A-Za-z]*[1-9A-Za-z]$/;

// Les extrémités de l'alphabet sont surreprésentées : ce sont elles qui forcent les préfixes
// communs et l'allongement du rang.
const caractere = fc.oneof(fc.constantFrom("0", "1", "y", "z"), fc.constantFrom(...ALPHABET));
const rang = fc
  .string({ unit: caractere, minLength: 1, maxLength: 6 })
  .filter((chaine) => !chaine.endsWith("0"));
const borneBasse = fc.oneof(fc.constant(BORNE_BASSE), rang);
const borneHaute = fc.oneof(fc.constant(BORNE_HAUTE), rang);
const bornesOrdonnees = fc
  .tuple(borneBasse, borneHaute)
  .filter(([bas, haut]) => haut === BORNE_HAUTE || bas < haut);

function estSousLaBorneHaute(valeur: string, haut: string | null): boolean {
  return haut === BORNE_HAUTE || valeur < haut;
}

describe("rang entre deux bornes", () => {
  it("F-001-AC2 pour toutes bornes a < b, le rang calculé est valide et strictement entre a et b", () => {
    fc.assert(
      fc.property(bornesOrdonnees, ([bas, haut]) => {
        const calcule = rangEntre(bas, haut);

        expect(calcule).toMatch(RANG_VALIDE);
        expect(bas < calcule).toBe(true);
        expect(estSousLaBorneHaute(calcule, haut)).toBe(true);
      }),
      { seed: GRAINE, numRuns: NOMBRE_EXECUTIONS },
    );
  });

  it("F-001-AC2 le rang calculé ne dépend que des deux bornes", () => {
    expect(rangEntre("A", "B")).toBe(rangEntre("A", "B"));
    expect(rangEntre(BORNE_BASSE, BORNE_HAUTE)).toBe(rangEntre(BORNE_BASSE, BORNE_HAUTE));
  });

  it.each([
    { cas: "entre les deux bornes", bas: BORNE_BASSE, haut: BORNE_HAUTE },
    { cas: "avant le plus petit rang d'un caractère", bas: BORNE_BASSE, haut: "1" },
    { cas: "après le plus grand caractère", bas: "z", haut: BORNE_HAUTE },
    { cas: "entre deux caractères voisins", bas: "A", haut: "B" },
    { cas: "sous un préfixe commun", bas: "A1", haut: "A2" },
    { cas: "sous un préfixe commun complété par des zéros", bas: "A", haut: "A01" },
  ])("F-001-AC2 rang $cas", ({ bas, haut }) => {
    const calcule = rangEntre(bas, haut);

    expect(calcule).toMatch(RANG_VALIDE);
    expect(bas < calcule).toBe(true);
    expect(estSousLaBorneHaute(calcule, haut)).toBe(true);
  });
});

describe("suite de rangs croissants entre deux bornes", () => {
  it("F-001-AC8 pour toutes bornes a < b et tout n, la suite compte n rangs valides, strictement croissants, strictement entre a et b", () => {
    fc.assert(
      fc.property(bornesOrdonnees, fc.nat({ max: 20 }), ([bas, haut], nombre) => {
        const elements = Array.from({ length: nombre }, (_, numero) => numero);

        const suite = rangsCroissantsEntre(bas, haut, elements);

        expect([...suite.keys()]).toEqual(elements);
        const rangs = [...suite.values()];
        rangs.forEach((calcule, indice) => {
          expect(calcule).toMatch(RANG_VALIDE);
          expect((rangs[indice - 1] ?? bas) < calcule).toBe(true);
          expect(estSousLaBorneHaute(calcule, haut)).toBe(true);
        });
      }),
      { seed: GRAINE, numRuns: NOMBRE_EXECUTIONS },
    );
  });

  it("F-001-AC8 la suite d'un seul élément est le rang entre les deux bornes", () => {
    expect([...rangsCroissantsEntre("A", "B", ["seule"])]).toEqual([
      ["seule", rangEntre("A", "B")],
    ]);
  });
});
