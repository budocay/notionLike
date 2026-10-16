// F-017 H9 : le calcul des rangs de F-029 est réutilisé par la table, sans être exporté. Ce fichier
// couvre `insertionParmi` (rang.ts), extraite de document-espace.ts et appelée par document-table.ts,
// la lecture bornée des rangs par format-table.ts, et son point unique d'écriture d'un rang admis.
import { readFileSync } from "node:fs";

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import { creerDocumentTable } from "../src/index.ts";
import { AUCUN_RANG_ADMIS, estUnRang, insertionParmi, type Rang } from "../src/rang.ts";
import { GRAINE, NOMBRE_EXECUTIONS } from "./aides.ts";

function texteDe(relatif: string): string {
  return readFileSync(new URL(relatif, import.meta.url), "utf8");
}

/** Les rangs après l'insertion, dans l'ordre des éléments, l'inséré à sa position. */
function rangsApres(rangs: readonly Rang[], position: number, longueurMax?: number): Rang[] {
  const insertion = insertionParmi(rangs, position, longueurMax);
  if (insertion === AUCUN_RANG_ADMIS) {
    throw new Error("aucun rang admis");
  }
  const suite = rangs.map((rang, indice) => insertion.reattribues.get(indice) ?? rang);
  suite.splice(position, 0, insertion.rang);
  return suite;
}

describe("insertionParmi (rang.ts)", () => {
  it("F-029-AC9 F-017-AC2 sans nécessité, seul l'élément inséré reçoit un rang", () => {
    const insertion = insertionParmi(["1", "5", "9"], 2);

    expect(insertion).not.toBe(AUCUN_RANG_ADMIS);
    expect(insertion !== AUCUN_RANG_ADMIS && [...insertion.reattribues]).toEqual([]);
    expect(rangsApres(["1", "5", "9"], 2)).toEqual(["1", "5", "7", "9"]);
  });

  it("F-029-AC8 F-017-AC6 entre deux éléments de même rang, ceux de ce rang qui suivent la position sont réattribués", () => {
    const insertion = insertionParmi(["U", "U", "U", "k"], 1);

    expect(insertion !== AUCUN_RANG_ADMIS && [...insertion.reattribues.keys()]).toEqual([1, 2]);
    const apres = rangsApres(["U", "U", "U", "k"], 1);
    expect(apres[0]).toBe("U");
    expect(apres.slice(1).every((rang, i) => rang > (apres[i] ?? ""))).toBe(true);
  });

  it("F-029-AC7 à la borne, la réattribution s'élargit à tous les éléments", () => {
    const insertion = insertionParmi(["1", "2"], 1, 1);

    expect(insertion).not.toBe(AUCUN_RANG_ADMIS);
    const apres = rangsApres(["1", "2"], 1, 1);
    expect(apres).toHaveLength(3);
    expect([...apres].sort()).toEqual(apres);
    expect(new Set(apres).size).toBe(3);
    expect(apres.every((rang) => estUnRang(rang, 1))).toBe(true);
  });

  it("F-029-AC10 si même la réattribution élargie ne tient pas dans la borne, le signalement est rendu", () => {
    const pleins = Array.from({ length: 61 }, (_, i) =>
      "123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz".charAt(i),
    );

    expect(insertionParmi(pleins, 30, 1)).toBe(AUCUN_RANG_ADMIS);
  });

  it("F-029-AC5 F-017-AC13 pour tous rangs admis triés (égalités comprises) et toute position, les rangs obtenus sont admis et l'ordre lu place l'inséré à la position, les autres dans leur ordre", () => {
    const rang = fc.constantFrom("1", "U", "UU", "k", "z", "V", "U1");
    fc.assert(
      fc.property(
        fc.array(rang, { maxLength: 8 }),
        fc.nat(),
        fc.integer({ min: 1, max: 4 }),
        (tires, choix, borne) => {
          const rangs = [...tires].filter((r) => estUnRang(r, borne)).sort();
          const position = choix % (rangs.length + 1);
          const insertion = insertionParmi(rangs, position, borne);
          if (insertion === AUCUN_RANG_ADMIS) {
            return;
          }
          const apres = rangsApres(rangs, position, borne);
          expect(apres.every((r) => estUnRang(r, borne))).toBe(true);
          // Ordre lu : rang, puis identifiant ; l'identifiant suit ici l'ordre d'origine, inséré compris.
          const ordre = apres
            .map((r, indice) => ({ r, indice }))
            .sort((a, b) => (a.r === b.r ? a.indice - b.indice : a.r < b.r ? -1 : 1))
            .map(({ indice }) => indice);
          expect(ordre).toEqual(apres.map((_, indice) => indice));
        },
      ),
      { seed: GRAINE, numRuns: NOMBRE_EXECUTIONS },
    );
  });
});

describe("rangs dans le document de table", () => {
  it("F-029-AC8 F-017-AC3 des lignes de même rang, écrites par un pair : une ligne insérée entre elles prend sa place, l'ordre des autres est gardé", () => {
    const table = creerDocumentTable();
    table.doc.transact(() => {
      for (const id of ["l1", "l2", "l3"]) {
        const ligne = new Y.Map<unknown>();
        ligne.set("rang", "U");
        ligne.set("supprimee", false);
        ligne.set("cellules", new Y.Map<unknown>());
        table.doc.getMap("lignes").set(id, ligne);
      }
    });

    const nouvelle = table.creerLigne(undefined, 1);

    expect(table.lire().lignes.map((ligne) => ligne.id)).toEqual(["l1", nouvelle, "l2", "l3"]);
  });

  it("F-029-AC1 F-017-AC20 une colonne, une option ou une ligne au rang de plus de 1 024 unités est ignorée à la lecture", () => {
    const table = creerDocumentTable();
    const colonne = table.creerColonne("S", "selection");
    table.ajouterOption(colonne, "o");
    const ligne = table.creerLigne();
    const long = "U".repeat(1025);
    const colonnes = table.doc.getMap("colonnes");
    const options = (colonnes.get(colonne) as Y.Map<unknown>).get("options") as Y.Map<unknown>;

    (table.doc.getMap("lignes").get(ligne) as Y.Map<unknown>).set("rang", long);
    expect(table.lire().lignes).toEqual([]);
    options.forEach((option) => (option as Y.Map<unknown>).set("rang", long));
    expect(table.lire().colonnes[0]?.options).toEqual([]);
    (colonnes.get(colonne) as Y.Map<unknown>).set("rang", "U".repeat(1024));
    expect(table.lire().colonnes).toHaveLength(1);
    (colonnes.get(colonne) as Y.Map<unknown>).set("rang", long);
    expect(table.lire().colonnes).toEqual([]);
  });
});

// ── Point unique d'écriture d'un rang (F-029-AC6, ADR-0016) ──────────────────────────────────────

/** Conversions vers `RangAdmis` dans un texte de module. */
function producteursDeRangAdmis(texte: string): number {
  return [...texte.matchAll(/\bas\s+RangAdmis\b/g)].length;
}

/** Valeurs passées aux écritures du champ `rang` : chacune doit être un `RangAdmis` nommé `rang`. */
function valeursEcritesDansLeRang(texte: string): string[] {
  return [...texte.matchAll(/\.set\(CHAMP_RANG,\s*([^)]*)\)/g)].map(([, valeur = ""]) =>
    valeur.trim(),
  );
}

describe("point unique d'écriture d'un rang de table", () => {
  it.each([
    ["deux conversions", "const a = x as RangAdmis;\nconst b = y as RangAdmis;\n", 2],
    ["aucune conversion", "const a = x as Rang;\n", 0],
  ])("F-029-AC6 le compte des producteurs de RangAdmis voit %s", (_cas, texte, attendu) => {
    expect(producteursDeRangAdmis(texte)).toBe(attendu);
  });

  it("F-029-AC6 la lecture des écritures du rang voit une valeur brute écrite", () => {
    expect(valeursEcritesDansLeRang('m.set(CHAMP_RANG, "U");\nm.set(CHAMP_RANG, rang);\n')).toEqual(
      ['"U"', "rang"],
    );
  });

  it("F-029-AC6 F-017-AC24 dans src/, seule admettreRang de format-table.ts produit un RangAdmis, et toute écriture du rang reçoit un RangAdmis", () => {
    const format = texteDe("../src/format-table.ts");

    expect(producteursDeRangAdmis(format)).toBe(1);
    expect(format).toMatch(
      /export function admettreRang\(rang: string\): RangAdmis \{[^}]*estUnRang\(/,
    );
    for (const module of [
      "document-table",
      "table",
      "rang",
      "index",
      "format",
      "document-espace",
    ]) {
      expect(producteursDeRangAdmis(texteDe(`../src/${module}.ts`)), module).toBe(0);
    }
    expect(valeursEcritesDansLeRang(format)).toEqual(["rang", "rang"]);
    expect(format).toMatch(/function nouvellesEntrees\(rang: RangAdmis\)/);
    expect(format).toMatch(
      /export function ecrireRang\(doc: Y\.Doc, cible: Cible, rang: RangAdmis\)/,
    );
    for (const forme of ["NouvelleColonne", "NouvelleOption", "NouvelleLigne"]) {
      expect(format).toMatch(new RegExp(`interface ${forme} \\{[^}]*readonly rang: RangAdmis;`));
    }
  });

  it("F-029-AC16 F-017-AC6 document-table.ts place par insertionParmi et admet chaque rang par admettreRang ; document-espace.ts appelle le même calcul", () => {
    const facade = texteDe("../src/document-table.ts");

    expect(facade).toMatch(/function placement\([^]*?\binsertionParmi\(rangs, position\)/);
    expect(facade).toMatch(/reattribues\.set\(id, admettreRang\(rang\)\)/);
    expect(facade).toMatch(/rang: admettreRang\(insertion\.rang\)/);
    expect(facade).not.toMatch(/\bestUnRang\b|\brangEntre\b/);
    expect(texteDe("../src/document-espace.ts")).toMatch(
      /function insertionALaPosition\([^]*?\binsertionParmi\(rangs, position, borne\)/,
    );
    expect(texteDe("../src/rang.ts")).toMatch(
      /export function insertionParmi\([^]*?\brangEntre\([^]*?function insertionElargie\([^]*?\brangsRepartis\(/,
    );
  });
});
