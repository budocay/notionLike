// Navigation au clavier dans la grille du mois (F-021-AC20) : de case en case par les flèches, Début,
// Fin, Page précédente et Page suivante, le mois voisin affiché quand le focus sort de la grille,
// Entrée et Échap entre une case et sa première entrée, un seul arrêt de tabulation.
import { act, screen } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import {
  caseDuJour,
  entree,
  figerLHorloge,
  grilleDuCalendrier,
  rendreLeCalendrier,
} from "./aides-calendrier.tsx";
import { focus } from "./aides-grille.tsx";

figerLHorloge();

const titre = (nom: string): HTMLElement => screen.getByRole("heading", { name: nom });

/** Une frappe à la fois : le focus se pose après le rendu, la frappe suivante vise la nouvelle case. */
async function presser(utilisateur: UserEvent, touche: string, fois: number): Promise<void> {
  for (let rang = 0; rang < fois; rang += 1) {
    await utilisateur.keyboard(`{${touche}}`);
  }
}

describe("flèches, Début, Fin, Page précédente et suivante (F-021-AC20)", () => {
  it.each([
    ["ArrowRight", "2026-10-08", "2026-10-09"],
    ["ArrowLeft", "2026-10-08", "2026-10-07"],
    ["ArrowDown", "2026-10-08", "2026-10-15"],
    ["ArrowUp", "2026-10-08", "2026-10-01"],
    ["Home", "2026-10-08", "2026-10-05"],
    ["End", "2026-10-08", "2026-10-11"],
    ["Home", "2026-10-11", "2026-10-05"],
    ["End", "2026-10-05", "2026-10-11"],
  ])(
    "F-021-AC20 %s sur la case du %s porte le focus sur la case du %s",
    async (touche, de, vers) => {
      const { utilisateur } = rendreLeCalendrier();
      act(() => caseDuJour(de).focus());
      await utilisateur.keyboard(`{${touche}}`);
      expect(focus()).toBe(caseDuJour(vers));
      expect(titre("octobre 2026")).toBeDefined();
    },
  );

  it("F-021-AC20 Page suivante et Page précédente gardent le quantième, ramené au dernier jour du mois s'il n'existe pas", async () => {
    const { utilisateur } = rendreLeCalendrier();
    act(() => caseDuJour("2026-10-31").focus());
    await utilisateur.keyboard("{PageDown}");
    expect(titre("novembre 2026")).toBeDefined();
    expect(focus()).toBe(caseDuJour("2026-11-30"));
    await utilisateur.keyboard("{PageDown}");
    expect(titre("décembre 2026")).toBeDefined();
    expect(focus()).toBe(caseDuJour("2026-12-30"));
    await presser(utilisateur, "PageUp", 3);
    // Le 30 novembre est dans la grille de décembre, le 30 septembre dans celle d'octobre : le mois
    // affiché ne change que lorsque le jour visé sort de la grille.
    expect(titre("octobre 2026")).toBeDefined();
    expect(focus()).toBe(caseDuJour("2026-09-30"));
    await utilisateur.keyboard("{PageDown}");
    expect(titre("octobre 2026")).toBeDefined();
    expect(focus()).toBe(caseDuJour("2026-10-30"));
  });

  it("F-021-AC20 depuis le 30 janvier, Page suivante tombe sur le 28 février", async () => {
    const { utilisateur } = rendreLeCalendrier();
    act(() => caseDuJour("2026-10-31").focus());
    // Octobre → février 2027 : trois Page suivante depuis le 31 donnent 30 nov., 30 déc., 30 janv.
    await presser(utilisateur, "PageDown", 3);
    expect(focus()).toBe(caseDuJour("2027-01-30"));
    await utilisateur.keyboard("{PageDown}");
    expect(titre("février 2027")).toBeDefined();
    expect(focus()).toBe(caseDuJour("2027-02-28"));
  });

  it("F-021-AC20 une flèche qui sort de la grille affiche le mois voisin et porte le focus sur le jour visé", async () => {
    const { utilisateur } = rendreLeCalendrier();
    act(() => caseDuJour("2026-11-01").focus());
    await utilisateur.keyboard("{ArrowRight}");
    expect(titre("novembre 2026")).toBeDefined();
    expect(focus()).toBe(caseDuJour("2026-11-02"));

    // La grille de novembre 2026 commence le lundi 26 octobre : le 25 en sort, octobre revient.
    act(() => caseDuJour("2026-10-26").focus());
    await utilisateur.keyboard("{ArrowLeft}");
    expect(titre("octobre 2026")).toBeDefined();
    expect(focus()).toBe(caseDuJour("2026-10-25"));
  });

  it("F-021-AC20 Flèche haut depuis la première semaine affiche le mois précédent", async () => {
    const { utilisateur } = rendreLeCalendrier();
    act(() => caseDuJour("2026-09-30").focus());
    await utilisateur.keyboard("{ArrowUp}");
    expect(titre("septembre 2026")).toBeDefined();
    expect(focus()).toBe(caseDuJour("2026-09-23"));
  });
});

describe("entrer dans une case, un seul arrêt de tabulation (F-021-AC20)", () => {
  const DEUX = [
    { titre: "Dentiste", date: "2026-10-08" },
    { titre: "Réunion", date: "2026-10-08" },
  ];

  it("F-021-AC20 Entrée sur une case porte le focus sur sa première entrée, Échap le rend à la case", async () => {
    const { utilisateur } = rendreLeCalendrier(DEUX);
    act(() => caseDuJour("2026-10-08").focus());
    await utilisateur.keyboard("{Enter}");
    expect(focus()).toBe(entree("Dentiste"));
    await utilisateur.keyboard("{Escape}");
    expect(focus()).toBe(caseDuJour("2026-10-08"));
  });

  it("F-021-AC20 Entrée sur une case sans entrée laisse le focus sur la case", async () => {
    const { utilisateur } = rendreLeCalendrier(DEUX);
    act(() => caseDuJour("2026-10-09").focus());
    await utilisateur.keyboard("{Enter}");
    expect(focus()).toBe(caseDuJour("2026-10-09"));
  });

  it("F-021-AC20 la grille ne compte que pour un seul arrêt de tabulation, qui suit la case focalisée", async () => {
    const { utilisateur } = rendreLeCalendrier(DEUX);
    const arrets = (): string[] =>
      [...grilleDuCalendrier().querySelectorAll<HTMLElement>('[tabindex="0"]')].map(
        (un) => un.getAttribute("data-jour") ?? un.tagName,
      );
    expect(arrets()).toEqual(["2026-10-08"]);
    act(() => caseDuJour("2026-10-08").focus());
    await utilisateur.keyboard("{ArrowRight}");
    expect(arrets()).toEqual(["2026-10-09"]);
    await utilisateur.tab();
    expect(grilleDuCalendrier().contains(focus())).toBe(false);
    await utilisateur.tab({ shift: true });
    expect(focus()).toBe(caseDuJour("2026-10-09"));
  });
});
