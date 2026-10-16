// F-017-AC18, H4, H13 : une cellule `date` n'accepte qu'un jour du calendrier grégorien étendu, écrit
// `AAAA-MM-JJ`, du 0001-01-01 au 9999-12-31. Table de cas tenue en ce seul endroit ; contrôle comparé
// à un oracle de test fondé sur `Date` en UTC.
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { creerDocumentTable } from "../src/index.ts";
import { estUneDate } from "../src/table.ts";
import { GRAINE, NOMBRE_EXECUTIONS } from "./aides.ts";
import { dateSelonLOracle as oracle, refus, refusDe } from "./aides-table.ts";

/** Seule table des cas de date de F-017-AC18 : vrai = accepté, faux = refusé. */
const CAS_DE_DATES: readonly (readonly [string, boolean])[] = [
  ["0001-01-01", true],
  ["9999-12-31", true],
  ["2024-02-29", true],
  ["2000-02-29", true],
  ["1582-10-10", true],
  ["0004-02-29", true],
  ["0000-01-01", false],
  ["0000-12-31", false],
  ["2023-02-29", false],
  ["1900-02-29", false],
  ["2024-13-01", false],
  ["2024-04-31", false],
  ["2024-00-10", false],
  ["2024-01-00", false],
  ["2024-1-5", false],
  ["10000-01-01", false],
  ["-0001-01-01", false],
  ["2024-01-01T00:00:00Z", false],
  ["", false],
  ["２０２４-01-01", false],
  [" 2024-01-01", false],
  ["2024/01/01", false],
];

describe("cellules date", () => {
  it.each(CAS_DE_DATES)("F-017-AC18 la date %j est acceptée : %s", (date, acceptee) => {
    const table = creerDocumentTable();
    const colonne = table.creerColonne("Échéance", "date");
    const ligne = table.creerLigne();

    const observe = refusDe(table.doc, () => table.ecrireCellule(ligne, colonne, date));

    if (acceptee) {
      expect(observe).toEqual({ code: "aucun", misesAJour: 1 });
      expect(table.lire().lignes[0]?.cellules).toEqual([date]);
    } else {
      expect(observe).toEqual(refus("valeur-non-conforme"));
      expect(table.lire().lignes[0]?.cellules).toEqual([null]);
    }
  });
});

const JOUR_EN_MS = 86_400_000;

// Oracle : un `Date` UTC à l'année posée par `setUTCFullYear` (sans le décalage des années 0 à 99).
function dateDuJour(numero: number): string {
  const jour = new Date(0);
  jour.setUTCFullYear(1, 0, 1);
  const instant = new Date(jour.getTime() + numero * JOUR_EN_MS);
  const annee = String(instant.getUTCFullYear()).padStart(4, "0");
  const mois = String(instant.getUTCMonth() + 1).padStart(2, "0");
  const quantieme = String(instant.getUTCDate()).padStart(2, "0");
  return `${annee}-${mois}-${quantieme}`;
}

describe("contrôle d'une date", () => {
  const PREMIER = dateDuJour(0);
  const NOMBRE_DE_JOURS = 3_652_059; // du 0001-01-01 au 9999-12-31 compris

  it("F-017-AC18 l'oracle de test borne bien les jours : premier et dernier jour", () => {
    expect(PREMIER).toBe("0001-01-01");
    expect(dateDuJour(NOMBRE_DE_JOURS - 1)).toBe("9999-12-31");
    expect(dateDuJour(NOMBRE_DE_JOURS)).toBe("10000-01-01");
  });

  it("F-017-AC18 tout jour du 0001-01-01 au 9999-12-31 est accepté", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: NOMBRE_DE_JOURS - 1 }), (numero) => {
        expect(estUneDate(dateDuJour(numero))).toBe(true);
      }),
      { seed: GRAINE, numRuns: NOMBRE_EXECUTIONS * 10 },
    );
  });

  it("F-017-AC18 toute chaîne de forme proche, ou quelconque, est jugée comme l'oracle", () => {
    const chiffres = (n: number) => fc.stringMatching(new RegExp(`^\\d{${n}}$`));
    const proche = fc
      .tuple(
        fc.oneof(chiffres(4), chiffres(3), chiffres(5), fc.constant("0000")),
        fc.oneof(chiffres(2), chiffres(1)),
        fc.oneof(chiffres(2), fc.constantFrom("28", "29", "30", "31", "32")),
      )
      .map(([a, m, j]) => `${a}-${m}-${j}`);
    fc.assert(
      fc.property(fc.oneof(proche, fc.string({ maxLength: 12 })), (texte) => {
        expect(estUneDate(texte)).toBe(oracle(texte));
      }),
      { seed: GRAINE, numRuns: NOMBRE_EXECUTIONS * 10 },
    );
  });

  it("F-017-AC18 chaque année bissextile ou non : le 29 février suit l'oracle", () => {
    for (let annee = 1; annee <= 9999; annee += 1) {
      const texte = `${String(annee).padStart(4, "0")}-02-29`;
      expect(estUneDate(texte), texte).toBe(oracle(texte));
    }
  });
});
