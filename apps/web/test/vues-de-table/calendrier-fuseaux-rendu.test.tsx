// Le rendu du calendrier ne dépend pas du fuseau (F-021-AC18, AC5) : sous chacun des fuseaux extrêmes,
// la vue place chaque ligne dans la case de son jour et dans cette case seulement, dans l'ordre des
// lignes, comparaison faite sur les chaînes `AAAA-MM-JJ`.
import { act, cleanup } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { entree, figerLHorloge, libellesDe, rendreLeCalendrier } from "./aides-calendrier.tsx";
import { FUSEAUX, rendreLeFuseau, sous } from "./aides-fuseaux.ts";

figerLHorloge();
rendreLeFuseau();

const LIGNES = [
  { titre: "Dentiste", date: "2026-10-08" },
  { titre: "Frontière", date: "2026-09-30" },
  { titre: "Même jour", date: "2026-10-08" },
  { titre: "Libre", date: null },
  { titre: "Lendemain", date: "2026-10-09" },
];

describe("rendu sous trois fuseaux (F-021-AC18)", () => {
  it.each(FUSEAUX)(
    "F-021-AC18 F-021-AC5 sous %s, chaque ligne est dans la case de son jour et dans celle-là seulement, dans l'ordre des lignes",
    (fuseau, decalage) => {
      sous(fuseau, decalage, () => {
        rendreLeCalendrier(LIGNES);
        expect(libellesDe("2026-10-08")).toEqual(["Dentiste", "Même jour"]);
        expect(libellesDe("2026-10-09")).toEqual(["Lendemain"]);
        expect(libellesDe("2026-09-30")).toEqual(["Frontière"]);
        expect(document.querySelectorAll("[data-ligne]")).toHaveLength(4);
        cleanup();
      });
    },
  );
});

describe("déplacement au clavier sous trois fuseaux (F-021-AC18, AC11)", () => {
  it.each(FUSEAUX)(
    "F-021-AC18 F-021-AC11 sous %s, Alt+Maj+Flèche droite écrit le lendemain, d'un mois à l'autre aussi, et la case d'arrivée porte l'entrée",
    async (fuseau, decalage) => {
      await sous(fuseau, decalage, async () => {
        const { utilisateur, table, emises } = rendreLeCalendrier(LIGNES);
        act(() => entree("Frontière").focus());
        await utilisateur.keyboard("{Alt>}{Shift>}{ArrowRight}{/Shift}{/Alt}");
        expect(emises).toHaveLength(1);
        expect(table.lire().lignes[1]?.cellules[1]).toBe("2026-10-01");
        expect(libellesDe("2026-10-01")).toEqual(["Frontière"]);
        expect(libellesDe("2026-09-30")).toEqual([]);
        await utilisateur.keyboard("{Alt>}{Shift>}{ArrowDown}{/Shift}{/Alt}");
        expect(table.lire().lignes[1]?.cellules[1]).toBe("2026-10-08");
        expect(libellesDe("2026-10-08")).toEqual(["Dentiste", "Frontière", "Même jour"]);
        cleanup();
      });
    },
  );
});
