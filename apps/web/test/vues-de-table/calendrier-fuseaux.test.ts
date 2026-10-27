// Le calendrier ne dépend pas du fuseau de l'appareil (F-021-AC18) : mêmes grilles, mêmes
// décalages, mêmes jours de semaine sous trois fuseaux extrêmes, et « aujourd'hui » toujours le jour
// de l'horloge locale. Sous le pool `forks` (celui du projet), `process.env.TZ` posé en cours de test
// est pris en compte par V8 ; l'effet est vérifié avant toute comparaison, puis le fuseau d'origine
// est rendu.
import { creerDocumentTable } from "@notionlike/document";
import { afterEach, describe, expect, it } from "vitest";

import { aujourdhuiDe } from "../../src/vues-de-table/aujourdhui.ts";
import {
  decaler,
  grilleDuMois,
  jourDeLaSemaine,
  lundiDeLaSemaine,
  memeQuantiemeAilleurs,
} from "../../src/vues-de-table/jours.ts";
import { ecrireLaDate, jourVise } from "../../src/vues-de-table/commandes-calendrier.ts";
import { type ColonneDeDate, repartir } from "../../src/vues-de-table/repartition.ts";

// Décalage attendu de `getTimezoneOffset()` un jour de mars 2026, en minutes.
const FUSEAUX: readonly (readonly [string, number])[] = [
  ["Pacific/Kiritimati", -840],
  ["UTC", 0],
  ["Pacific/Pago_Pago", 660],
  ["Europe/Paris", -120],
];

const ORIGINE = process.env.TZ;
afterEach(() => {
  if (ORIGINE === undefined) {
    delete process.env.TZ;
  } else {
    process.env.TZ = ORIGINE;
  }
});

function sous<T>(fuseau: string, decalage: number, calcul: () => T): T {
  process.env.TZ = fuseau;
  // Sans effet constaté, la comparaison ne prouverait rien : on s'arrête ici.
  expect(new Date(2026, 2, 29, 12).getTimezoneOffset(), `fuseau ${fuseau} appliqué`).toBe(decalage);
  return calcul();
}

const DATE: ColonneDeDate = {
  colonne: { id: "d", nom: "Date", type: "date", options: [] },
  rang: 0,
};

function empreinte(): unknown {
  const lignes = ["2026-03-29", "2026-03-30", "2026-03-28", null, "2026-10-25"].map((v, i) => ({
    id: `l${String(i)}`,
    cellules: [v],
  }));
  const grille = grilleDuMois({ annee: 2026, mois: 3 });
  const repartition = repartir(lignes, DATE.rang, grille);
  return {
    grille,
    placement: [...repartition.parJour].map(([jour, dedans]) => [jour, dedans.map((l) => l.id)]),
    sansDate: repartition.sansDate.map((l) => l.id),
    suite: [decaler("2026-03-29", 1), decaler("2026-03-30", -1), decaler("2026-10-25", 1)],
    semaine: [jourDeLaSemaine("2026-03-29"), lundiDeLaSemaine("2026-03-29")],
    mois: [memeQuantiemeAilleurs("2026-03-31", -1), memeQuantiemeAilleurs("2026-01-31", 1)],
    enumeration: Array.from({ length: 400 }, (_, i) => decaler("2025-10-01", i)),
  };
}

describe("indépendance du fuseau (F-021-AC18)", () => {
  it.each(FUSEAUX)(
    "F-021-AC18 sous %s, le fuseau est bien appliqué et 2026-03-29 → 2026-03-30 → 2026-03-29",
    (fuseau, decalage) => {
      sous(fuseau, decalage, () => {
        expect(decaler("2026-03-29", 1)).toBe("2026-03-30");
        expect(decaler("2026-03-30", -1)).toBe("2026-03-29");
        expect(decaler("2026-10-25", 1)).toBe("2026-10-26");
        expect(jourDeLaSemaine("2026-03-29")).toBe(6);
      });
    },
  );

  it.each(FUSEAUX)(
    "F-021-AC18 F-021-AC11 sous %s, la cellule 2026-03-29 déplacée au jour suivant puis au précédent se relit 2026-03-30 puis 2026-03-29",
    (fuseau, decalage) => {
      sous(fuseau, decalage, () => {
        const table = creerDocumentTable();
        const colonne = table.creerColonne("Échéance", "date");
        table.creerLigne(new Map([[colonne, "2026-03-29"]]));
        const date: ColonneDeDate = { colonne: table.lire().colonnes[0]!, rang: 0 };
        for (const [pas, attendu] of [
          [1, "2026-03-30"],
          [-1, "2026-03-29"],
        ] as const) {
          const ligne = table.lire().lignes[0]!;
          const vise = jourVise(ligne, date, pas);
          expect(vise).toBe(attendu);
          expect(ecrireLaDate(table, ligne, date, vise ?? null)).toBeUndefined();
          expect(table.lire().lignes[0]?.cellules[0]).toBe(attendu);
        }
        table.fermer();
      });
    },
  );

  it("F-021-AC18 grilles, placement, décalages et énumération identiques sous chaque fuseau", () => {
    const [premier, ...autres] = FUSEAUX.map(([fuseau, decalage]) =>
      sous(fuseau, decalage, empreinte),
    );
    for (const autre of autres) {
      expect(autre).toEqual(premier);
    }
  });

  it("F-021-AC18 « aujourd'hui » est le jour de l'horloge locale sous chaque fuseau, DST comprise", () => {
    for (const [fuseau, decalage] of FUSEAUX) {
      sous(fuseau, decalage, () => {
        expect(aujourdhuiDe(() => new Date(2026, 2, 29, 12))).toBe("2026-03-29");
        expect(aujourdhuiDe(() => new Date(2026, 2, 29, 23, 59, 59))).toBe("2026-03-29");
        expect(aujourdhuiDe(() => new Date(2026, 2, 30, 0, 0, 0))).toBe("2026-03-30");
      });
    }
  });
});
