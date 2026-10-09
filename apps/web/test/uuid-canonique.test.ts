import { describe, expect, it, vi } from "vitest";

import { estUuidCanonique } from "../src/identifiants/uuid-canonique.ts";
import {
  FORMES_REFUSEES,
  FORMES_REFUSEES_DE_LONGUEUR_CANONIQUE,
  PAGE_P,
  TABLE_T,
  UUID_AVEC_LETTRES,
} from "./aides-identifiants.ts";

describe("forme d'un identifiant", () => {
  it.each(FORMES_REFUSEES)("F-002-AC27 F-002-AC28 refuse un identifiant %s", (_cas, valeur) => {
    expect(estUuidCanonique(valeur)).toBe(false);
  });

  it.each([
    ["avec des lettres", UUID_AVEC_LETTRES],
    ["de page", PAGE_P],
    ["de table", TABLE_T],
    ["fait de zéros, la version n'étant pas contrôlée", "00000000-0000-0000-0000-000000000000"],
    ["fait de « f »", "ffffffff-ffff-ffff-ffff-ffffffffffff"],
  ])("F-002-AC27 F-002-AC28 accepte un UUID canonique %s", (_cas, valeur) => {
    expect(estUuidCanonique(valeur)).toBe(true);
  });

  it("F-002-AC27 accepte ce que produit crypto.randomUUID, et le refuse une fois passé en majuscules", () => {
    for (let tirage = 0; tirage < 50; tirage += 1) {
      const identifiant = crypto.randomUUID();

      expect(estUuidCanonique(identifiant)).toBe(true);
      expect(estUuidCanonique(`${identifiant.slice(0, -1)}F`)).toBe(false);
    }
  });

  it("F-002-AC27 la table des refus couvre les cas que seule l'analyse de la forme peut écarter", () => {
    expect(FORMES_REFUSEES_DE_LONGUEUR_CANONIQUE.length).toBeGreaterThanOrEqual(10);
    expect(FORMES_REFUSEES.length).toBeGreaterThan(FORMES_REFUSEES_DE_LONGUEUR_CANONIQUE.length);
  });

  it("F-002-AC27 la longueur est bornée avant l'analyse : une chaîne d'une autre longueur n'atteint aucune expression régulière", () => {
    // `test`, `match` et `search` passent tous par `exec` : l'espionner suffit à voir toute analyse.
    const analyses = vi.spyOn(RegExp.prototype, "exec");
    const nombreDAnalyses = (): number => analyses.mock.calls.length;

    const horsLongueur = FORMES_REFUSEES.filter(
      (forme) => !FORMES_REFUSEES_DE_LONGUEUR_CANONIQUE.includes(forme),
    ).map(([, valeur]) => estUuidCanonique(valeur));
    const analysesHorsLongueur = nombreDAnalyses();
    const deLongueurCanonique = FORMES_REFUSEES_DE_LONGUEUR_CANONIQUE.map(([, valeur]) =>
      estUuidCanonique(valeur),
    );
    const analysesDeLongueurCanonique = nombreDAnalyses();
    vi.restoreAllMocks();

    expect(horsLongueur).toEqual(horsLongueur.map(() => false));
    expect(deLongueurCanonique).toEqual(deLongueurCanonique.map(() => false));
    expect(analysesHorsLongueur).toBe(0);
    expect(analysesDeLongueurCanonique).toBe(FORMES_REFUSEES_DE_LONGUEUR_CANONIQUE.length);
  });
});
