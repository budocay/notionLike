// Le calendrier ne dépend pas du fuseau de l'appareil (F-021-AC18) : mêmes grilles, mêmes
// décalages, mêmes jours de semaine sous trois fuseaux extrêmes, et « aujourd'hui » toujours le jour
// de l'horloge locale. Sous le pool `forks` (celui du projet), `process.env.TZ` posé en cours de test
// est pris en compte par V8 ; l'effet est vérifié avant toute comparaison, puis le fuseau d'origine
// est rendu.
import { creerDocumentTable } from "@notionlike/document";
import { describe, expect, it } from "vitest";

import { aujourdhuiDe } from "../../src/vues-de-table/aujourdhui.ts";
import {
  decaler,
  grilleDuMois,
  jourDeLaSemaine,
  lundiDeLaSemaine,
  memeQuantiemeAilleurs,
} from "../../src/vues-de-table/jours.ts";
import { SANS_SURVEILLANCE } from "../../src/vues-de-table/ecritures.ts";
import { ecrireLaDate, jourVise } from "../../src/vues-de-table/ecritures-du-calendrier.ts";
import { type ColonneDeDate, repartir } from "../../src/vues-de-table/repartition.ts";
import { oracle, verifierLEnumeration } from "./aides-enumeration-jours.ts";
import { FUSEAUX, rendreLeFuseau, sous } from "./aides-fuseaux.ts";

rendreLeFuseau();

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
          expect(ecrireLaDate(table, ligne, date, vise ?? null, SANS_SURVEILLANCE)).toBeUndefined();
          expect(table.lire().lignes[0]?.cellules[0]).toBe(attendu);
        }
        table.fermer();
      });
    },
  );

  it.each(FUSEAUX)(
    "F-021-AC18 F-021-AC16 sous %s, chaque jour de 1899-12-25 à 2101-01-07 est celui de l'oracle Date.UTC",
    (fuseau, decalage) => {
      sous(fuseau, decalage, () => {
        verifierLEnumeration(oracle());
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
