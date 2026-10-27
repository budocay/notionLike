// Grande table dans le calendrier (F-021-AC28) : 5 000 lignes, dont 2 000 datées dans le mois affiché
// et 1 000 sans date ; le DOM reste borné (trois entrées par case, 100 lignes dans le panneau) et le
// placement des lignes, fonction sans DOM, égale un calcul de référence. La table lue est fabriquée
// ici : bâtir 5 000 lignes par la façade du document est quadratique (chaque écriture relit la table).
import type { DocumentTable, LigneLue, TableLue } from "@notionlike/document";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { SANS_SURVEILLANCE } from "../../src/vues-de-table/ecritures.ts";
import { grilleDuMois } from "../../src/vues-de-table/jours.ts";
import { repartir } from "../../src/vues-de-table/repartition.ts";
import { VueCalendrier } from "../../src/vues-de-table/VueCalendrier.tsx";
import { cases, figerLHorloge, lignesDuPanneau, panneau } from "./aides-calendrier.tsx";

figerLHorloge();
afterEach(cleanup);

const DATEES = 2000;
const SANS_DATE = 1000;
const AILLEURS = 2000;
const JOURS_DE_LA_GRILLE = 35;

const jour = (rang: number, mois: string): string =>
  `${mois}-${String((rang % 28) + 1).padStart(2, "0")}`;

const LIGNES: readonly LigneLue[] = [
  ...Array.from({ length: DATEES }, (_, rang): LigneLue => ({
    id: `o${String(rang)}`,
    cellules: [`Octobre ${String(rang)}`, jour(rang, "2026-10")],
  })),
  ...Array.from({ length: SANS_DATE }, (_, rang): LigneLue => ({
    id: `s${String(rang)}`,
    cellules: [`Libre ${String(rang)}`, rang % 2 === 0 ? null : "n'importe quoi"],
  })),
  ...Array.from({ length: AILLEURS }, (_, rang): LigneLue => ({
    id: `a${String(rang)}`,
    cellules: [`Loin ${String(rang)}`, jour(rang, "2027-05")],
  })),
];

const TABLE: TableLue = {
  colonnes: [
    { id: "nom", nom: "Nom", type: "texte", options: [] },
    { id: "date", nom: "Échéance", type: "date", options: [] },
  ],
  lignes: LIGNES,
};

function rendre(): void {
  render(
    <VueCalendrier
      table={{} as DocumentTable}
      lue={TABLE}
      lignes={TABLE.lignes}
      titre="Grande"
      idEspace={undefined}
      idTable="grande"
      surveillance={SANS_SURVEILLANCE}
    />,
  );
}

describe("grande table (F-021-AC28)", () => {
  it("F-021-AC28 5 000 lignes : au plus trois entrées par case non dépliée et 100 lignes dans le panneau", () => {
    expect(LIGNES).toHaveLength(5000);
    rendre();
    const grille = cases();
    expect(grille).toHaveLength(JOURS_DE_LA_GRILLE);
    for (const une of grille) {
      expect(une.querySelectorAll("[data-ligne]").length).toBeLessThanOrEqual(3);
    }
    // 2 000 lignes sur 28 jours : chaque jour en porte 71 ou 72, dont trois sont présentes.
    expect(document.querySelectorAll("[data-ligne]")).toHaveLength(28 * 3);
    expect(screen.getAllByRole("button", { name: /^\d+ autres? / })).toHaveLength(28);
    expect(lignesDuPanneau()).toHaveLength(100);
    expect(panneau().textContent).toContain(String(SANS_DATE));
    expect(screen.getByRole("button", { name: "Afficher 100 lignes de plus" })).toBeDefined();
  });

  it("F-021-AC28 le placement est égal à un calcul de référence écrit dans le test", () => {
    const rang = 1;
    const grille = grilleDuMois({ annee: 2026, mois: 10 });
    const obtenu = repartir(LIGNES, rang, grille);

    // Référence : un balayage de toutes les lignes pour chaque jour de la grille.
    for (const unJour of grille) {
      const attendu = LIGNES.filter((ligne) => ligne.cellules[rang] === unJour).map((l) => l.id);
      expect((obtenu.parJour.get(unJour) ?? []).map((l) => l.id)).toEqual(attendu);
    }
    const sansDate = LIGNES.filter(
      (ligne) => !/^\d{4}-\d{2}-\d{2}$/.test(String(ligne.cellules[rang] ?? "")),
    ).map((l) => l.id);
    expect(obtenu.sansDate.map((l) => l.id)).toEqual(sansDate);
    expect(sansDate).toHaveLength(SANS_DATE);
    const placees = grille.reduce(
      (somme, unJour) => somme + (obtenu.parJour.get(unJour)?.length ?? 0),
      0,
    );
    expect(placees).toBe(DATEES);
  });
});
