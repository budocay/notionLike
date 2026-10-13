// F-029, calcul de rang : itératif, borné, et rendant un rang admis ou un signalement typé.
import { readFileSync } from "node:fs";

import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  AUCUN_RANG_ADMIS,
  BORNE_BASSE,
  BORNE_HAUTE,
  type Rang,
  type RangCalcule,
  rangEntre,
  rangsCroissantsEntre,
  rangsRepartis,
} from "../src/rang.ts";
import { BORNE, estAdmis } from "./aides-borne.ts";
import { GRAINE, NOMBRE_EXECUTIONS } from "./aides.ts";

const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const TEXTE_DU_MODULE = readFileSync(new URL("../src/rang.ts", import.meta.url), "utf8");

function estStrictementEntre(rang: Rang, bas: Rang, haut: Rang | null): boolean {
  return bas < rang && (haut === BORNE_HAUTE || rang < haut);
}

// Un résultat est soit le signalement, soit un rang admis strictement entre les bornes (F-029-AC5).
function attendreUnResultatConforme(calcule: RangCalcule, bas: Rang, haut: Rang | null): void {
  if (calcule !== AUCUN_RANG_ADMIS) {
    expect(typeof calcule).toBe("string");
    expect(estAdmis(calcule)).toBe(true);
    expect(estStrictementEntre(calcule, bas, haut)).toBe(true);
  }
}

describe("aucune récursion non bornée", () => {
  it("F-029-AC4 deux rangs de 1 000 000 d'unités partageant un préfixe de 999 999 unités, puis 1 000 000 de « z » et la borne haute : retour sans exception", () => {
    // Témoin consigné avant correction : le code de F-001 levait ici
    // « RangeError: Maximum call stack size exceeded ».
    const prefixe = "V".repeat(999_999);

    let premier: RangCalcule = AUCUN_RANG_ADMIS;
    expect(() => {
      premier = rangEntre(`${prefixe}1`, `${prefixe}2`);
    }).not.toThrow();
    let second: RangCalcule = "";
    expect(() => {
      second = rangEntre("z".repeat(1_000_000), BORNE_HAUTE);
    }).not.toThrow();

    expect(premier).toBe(AUCUN_RANG_ADMIS);
    expect(second).toBe(AUCUN_RANG_ADMIS);
    expect(() => rangsCroissantsEntre("z".repeat(1_000_000), BORNE_HAUTE, [1, 2, 3])).not.toThrow();
  });

  // Cas fautifs en données : le contrôle statique doit les voir.
  it.each([
    ["un appel direct", "function f(a) {\n  return f(a.slice(1));\n}\n", ["f"]],
    [
      "un appel exporté, au milieu d'autres fonctions",
      "export function a() {\n  return 1;\n}\nexport function rangEntre(b, h) {\n  return x + rangEntre(b, h);\n}\n",
      ["rangEntre"],
    ],
    ["une fonction fléchée", "const g = (n) => (n > 0 ? g(n - 1) : 0);\n", ["g"]],
    ["aucune récursion", "function f() {\n  return h();\n}\nfunction h() {\n  return 1;\n}\n", []],
  ])(
    "F-029-AC4 le contrôle des fonctions qui s'appellent elles-mêmes voit %s",
    (_cas, texte, attendues) => {
      expect(fonctionsRecursives(texte)).toEqual(attendues);
    },
  );

  it("F-029-AC4 aucune fonction de src/rang.ts ne s'appelle elle-même", () => {
    expect(nomsDeFonctions(TEXTE_DU_MODULE).length).toBeGreaterThanOrEqual(6);
    expect(fonctionsRecursives(TEXTE_DU_MODULE)).toEqual([]);
  });
});

// Chaque fonction s'étend de sa déclaration à la suivante ; un appel de son propre nom y est cherché.
function nomsDeFonctions(texte: string): string[] {
  return [
    ...texte.matchAll(/(?:\bfunction\s+([\w$]+)|\bconst\s+([\w$]+)\s*=\s*\([^)]*\)\s*=>)/g),
  ].map(([, declaree, flechee]) => declaree ?? flechee ?? "");
}

function fonctionsRecursives(texte: string): string[] {
  const declarations = [
    ...texte.matchAll(/(?:\bfunction\s+([\w$]+)|\bconst\s+([\w$]+)\s*=\s*\([^)]*\)\s*=>)/g),
  ];
  return declarations
    .filter((declaration, indice) => {
      const nom = declaration[1] ?? declaration[2] ?? "";
      const debut = declaration.index + declaration[0].length;
      const corps = texte.slice(debut, declarations[indice + 1]?.index ?? texte.length);
      return new RegExp(`(?<![\\w$.])${nom.replace("$", "\\$")}\\s*\\(`).test(corps);
    })
    .map((declaration) => declaration[1] ?? declaration[2] ?? "");
}

// Les extrémités de l'alphabet et les longueurs 1023 et 1024 sont surreprésentées.
const chiffre = fc.oneof(fc.constantFrom("0", "1", "y", "z"), fc.constantFrom(...ALPHABET));
const longueur = fc.oneof(
  fc.constantFrom(1, 2, BORNE - 1, BORNE),
  fc.integer({ min: 1, max: BORNE }),
);
const rangLong = fc
  .tuple(longueur, fc.constantFrom("0", "z", "V", "1"), fc.string({ unit: chiffre, maxLength: 4 }))
  .map(([taille, fond, queue]) => (fond.repeat(taille) + queue).slice(-taille))
  .map((rang) => (rang.endsWith("0") ? `${rang.slice(0, -1)}1` : rang));
const rangQuelconque = fc.oneof(
  rangLong,
  fc
    .string({ unit: chiffre, minLength: 1, maxLength: BORNE })
    .filter((rang) => !rang.endsWith("0")),
);
const bornesLongues = fc
  .tuple(
    fc.oneof(fc.constant(BORNE_BASSE), rangQuelconque),
    fc.oneof(fc.constant(BORNE_HAUTE), rangQuelconque),
  )
  .filter(([bas, haut]) => haut === BORNE_HAUTE || bas < haut);
const rangCourt = fc
  .string({ unit: chiffre, minLength: 1, maxLength: 6 })
  .filter((rang) => !rang.endsWith("0"));
const bornesCourtes = fc
  .tuple(
    fc.oneof(fc.constant(BORNE_BASSE), rangCourt),
    fc.oneof(fc.constant(BORNE_HAUTE), rangCourt),
  )
  .filter(([bas, haut]) => haut === BORNE_HAUTE || bas < haut);

describe("résultat du calcul", () => {
  it("F-029-AC5 pour des bornes ordonnées de 1 à 1024 unités, le calcul rend un rang admis strictement entre elles, ou le signalement typé, jamais une exception", () => {
    fc.assert(
      fc.property(bornesLongues, ([bas, haut]) => {
        attendreUnResultatConforme(rangEntre(bas, haut), bas, haut);
      }),
      { seed: GRAINE, numRuns: NOMBRE_EXECUTIONS * 3 },
    );
  });

  it("F-029-AC5 pour des bornes ordonnées de 6 unités au plus, le calcul rend toujours un rang", () => {
    fc.assert(
      fc.property(bornesCourtes, ([bas, haut]) => {
        const calcule = rangEntre(bas, haut);

        expect(calcule).not.toBe(AUCUN_RANG_ADMIS);
        attendreUnResultatConforme(calcule, bas, haut);
      }),
      { seed: GRAINE, numRuns: NOMBRE_EXECUTIONS },
    );
  });

  it("F-029-AC5 le signalement n'est rendu que s'il n'existe aucun rang admis : à la borne, avec ou sans voisin", () => {
    const prefixe = "V".repeat(BORNE - 1);

    expect(rangEntre(`${prefixe}1`, `${prefixe}2`)).toBe(AUCUN_RANG_ADMIS);
    expect(rangEntre("z".repeat(BORNE), BORNE_HAUTE)).toBe(AUCUN_RANG_ADMIS);
    expect(rangEntre(BORNE_BASSE, `${"0".repeat(BORNE - 1)}1`)).toBe(AUCUN_RANG_ADMIS);
    // Un chiffre de moins, et la place existe : le rang rendu compte alors exactement 1024 unités.
    expect(rangEntre(`${prefixe.slice(1)}1`, `${prefixe.slice(1)}2`)).toHaveLength(BORNE);
    expect(rangEntre("z".repeat(BORNE - 1), BORNE_HAUTE)).toBe(`${"z".repeat(BORNE - 1)}V`);
    expect(rangEntre(BORNE_BASSE, `${"0".repeat(BORNE - 2)}1`)).toBe(`${"0".repeat(BORNE - 1)}V`);
  });

  it.each<[string, Rang, Rang | null]>([
    ["des bornes inversées", "k", "F"],
    ["des bornes égales", "V", "V"],
    ["un caractère hors alphabet", "A-", "B"],
    ["une borne basse trop longue", "z".repeat(BORNE + 5), BORNE_HAUTE],
  ])("F-029-AC5 %s donnent un résultat conforme, sans exception", (_cas, bas, haut) => {
    let calcule: RangCalcule = AUCUN_RANG_ADMIS;
    expect(() => {
      calcule = rangEntre(bas, haut);
    }).not.toThrow();
    if (calcule !== AUCUN_RANG_ADMIS) {
      expect(estAdmis(calcule)).toBe(true);
    }
  });

  it("F-029-AC5 F-029-AC7 la répartition élargie rend des rangs admis strictement croissants, ou le signalement quand la borne ne les permet pas", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 20_000 }),
        fc.integer({ min: 1, max: 4 }),
        (nombre, borne) => {
          const repartis = rangsRepartis(nombre, borne);
          if (repartis === AUCUN_RANG_ADMIS) {
            expect(61 * 62 ** (borne - 1)).toBeLessThan(nombre);
            return;
          }
          expect(repartis).toHaveLength(nombre);
          const fautifs = repartis.filter(
            (rang, indice) =>
              !estAdmis(rang, borne) || (repartis[indice - 1] ?? BORNE_BASSE) >= rang,
          );
          expect(fautifs).toEqual([]);
        },
      ),
      { seed: GRAINE, numRuns: NOMBRE_EXECUTIONS },
    );
    expect(rangsRepartis(61, 1)).toHaveLength(61);
    expect(rangsRepartis(62, 1)).toBe(AUCUN_RANG_ADMIS);
  });
});

describe("structure du module de rang", () => {
  it("F-029-AC17 src/rang.ts n'importe rien, et surtout pas yjs", () => {
    expect(TEXTE_DU_MODULE).not.toMatch(/\bimport\b|\brequire\s*\(/);
    expect(TEXTE_DU_MODULE).not.toMatch(/yjs/);
  });
});
