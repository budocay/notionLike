// Enveloppe des réglages de vue (F-018-AC40, AC41, ADR-0019) : clé, version, sections, valeurs par
// défaut quand le stockage manque ou lève, section inconnue conservée, version plus récente jamais
// réécrite. Le contenu des sections est jugé par le module des vues (test/vues-de-table/).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  cleDesReglagesDeVue,
  ecrireReglagesDeVue,
  effacerReglagesDeVue,
  ErreurPersistance,
  lireReglagesDeVue,
} from "../src/persistance/index.ts";
import { lire, lireDossier } from "./aides-disque.ts";
import { ESPACE_A, ESPACE_B } from "./aides-persistance.ts";
import { cleDesReglages } from "./aides-table.ts";

// Une table neuve par test : les réglages tenus en mémoire par le module vivent autant que lui.
function designation(idEspace = ESPACE_A) {
  return { idEspace, idTable: crypto.randomUUID() };
}

let avertissements: ReturnType<typeof vi.spyOn>[];
beforeEach(() => {
  localStorage.clear();
  avertissements = [vi.spyOn(console, "warn"), vi.spyOn(console, "error")];
});
afterEach(() => {
  for (const espion of avertissements) {
    expect(espion).not.toHaveBeenCalled();
  }
  // Le cas « localStorage absent » l'a remplacé : il est rendu avant d'être vidé.
  vi.unstubAllGlobals();
  localStorage.clear();
});

function enregistre(cle: string): unknown {
  const texte = localStorage.getItem(cle);
  return texte === null ? null : JSON.parse(texte);
}

describe("clé et enregistrement (F-018-AC40)", () => {
  it("F-018-AC40 une seule fonction assemble la clé notionlike:vue:<idEspace>:<idTable>, et refuse un identifiant qui n'est pas un UUID canonique", () => {
    const table = designation();
    expect(cleDesReglagesDeVue(table)).toBe(cleDesReglages(table));
    for (const refusee of [
      { idEspace: "pas-un-uuid", idTable: table.idTable },
      { idEspace: ESPACE_A.toUpperCase(), idTable: table.idTable },
      { idEspace: ESPACE_A, idTable: `${table.idTable}:x` },
    ]) {
      expect(() => cleDesReglagesDeVue(refusee)).toThrow(ErreurPersistance);
      expect(lireReglagesDeVue(refusee)).toEqual({});
      ecrireReglagesDeVue(refusee, { vue: { active: "tableau" } });
    }
    expect(localStorage.length).toBe(0);
  });

  it("F-018-AC40 aucun autre module d'apps/web ne nomme localStorage ni n'assemble la clé des réglages de vue", () => {
    const sources = lireDossier("src");
    const quiNomment = [...sources.keys()].filter((chemin) =>
      /\blocalStorage\b|notionlike:vue/.test(sources.get(chemin) ?? ""),
    );
    expect(quiNomment).toEqual(["src/persistance/reglages-de-vue.ts"]);
    expect(lire("src/persistance/reglages-de-vue.ts")).not.toMatch(/indexedDB/);
  });

  it("F-018-AC40 rien n'est écrit tant qu'aucun réglage ne s'écarte de sa valeur par défaut : une section retirée d'un enregistrement absent n'écrit rien", () => {
    const table = designation();
    const ecrire = vi.spyOn(Storage.prototype, "setItem");
    const retirer = vi.spyOn(Storage.prototype, "removeItem");

    ecrireReglagesDeVue(table, { vue: undefined, tableau: undefined });

    expect(lireReglagesDeVue(table)).toEqual({});
    expect(ecrire).not.toHaveBeenCalled();
    expect(retirer).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
  });

  it("F-018-AC40 l'enregistrement porte la version 1 et des sections nommées ; relu après un rechargement, il rend les mêmes réglages ; sans section, la clé est retirée", () => {
    const table = designation();

    ecrireReglagesDeVue(table, { tableau: { largeurs: { c: 240 } } });
    ecrireReglagesDeVue(table, { vue: { active: "tableau" } });

    expect(enregistre(cleDesReglages(table))).toEqual({
      version: 1,
      sections: { tableau: { largeurs: { c: 240 } }, vue: { active: "tableau" } },
    });
    expect(lireReglagesDeVue(table)).toEqual({
      tableau: { largeurs: { c: 240 } },
      vue: { active: "tableau" },
    });
    ecrireReglagesDeVue(table, { tableau: undefined, vue: undefined });
    expect(localStorage.getItem(cleDesReglages(table))).toBeNull();
  });
});

describe("stockage absent, en échec ou enregistrement illisible (F-018-AC41)", () => {
  it.each([
    ["localStorage absent", () => vi.stubGlobal("localStorage", undefined)],
    [
      "localStorage qui lève à la lecture et à l'écriture",
      () => {
        vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
          throw new DOMException("refus", "SecurityError");
        });
        vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
          throw new DOMException("refus", "SecurityError");
        });
      },
    ],
  ])(
    "F-018-AC41 %s : valeurs par défaut, réglages tenus en mémoire pour l'onglet, sans erreur ni avertissement",
    (_cas, couper) => {
      const table = designation();
      couper();

      expect(lireReglagesDeVue(table)).toEqual({});
      ecrireReglagesDeVue(table, { tableau: { largeurs: { c: 300 } } });
      expect(lireReglagesDeVue(table)).toEqual({ tableau: { largeurs: { c: 300 } } });
      effacerReglagesDeVue(table.idEspace, [table.idTable]);
      expect(lireReglagesDeVue(table)).toEqual({});
    },
  );

  it("F-018-AC41 une écriture refusée par le stockage (quota) : les réglages restent en mémoire, l'enregistrement d'avant reste tel quel", () => {
    const table = designation();
    ecrireReglagesDeVue(table, { vue: { active: "tableau" } });
    const avant = localStorage.getItem(cleDesReglages(table));
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("plein", "QuotaExceededError");
    });

    ecrireReglagesDeVue(table, { tableau: { largeurs: { c: 120 } } });

    expect(lireReglagesDeVue(table)).toEqual({
      vue: { active: "tableau" },
      tableau: { largeurs: { c: 120 } },
    });
    expect(localStorage.getItem(cleDesReglages(table))).toBe(avant);
  });

  it.each([
    ["un texte qui n'est pas du JSON", "{pas du json"],
    ["un nombre", "12"],
    ["un tableau", "[1,2]"],
    ["null", "null"],
    ["une version absente", '{"sections":{}}'],
    ["une version qui n'est pas un entier", JSON.stringify({ version: "1", sections: {} })],
    ["une version 0", JSON.stringify({ version: 0, sections: {} })],
    ["des sections qui ne sont pas un objet", JSON.stringify({ version: 1, sections: [1] })],
  ])(
    "F-018-AC41 un enregistrement illisible (%s) se lit sans section ; une écriture le remplace par un enregistrement de version 1",
    (_cas, texte) => {
      const table = designation();
      localStorage.setItem(cleDesReglages(table), texte);

      expect(lireReglagesDeVue(table)).toEqual({});
      ecrireReglagesDeVue(table, { vue: { active: "tableau" } });

      expect(enregistre(cleDesReglages(table))).toEqual({
        version: 1,
        sections: { vue: { active: "tableau" } },
      });
    },
  );

  it("F-018-AC41 un enregistrement de version supérieure à 1 se lit sans section et n'est jamais réécrit ; le changement vaut pour l'onglet", () => {
    const table = designation();
    const plusRecent = JSON.stringify({ version: 2, sections: { vue: { active: "kanban" } } });
    localStorage.setItem(cleDesReglages(table), plusRecent);

    expect(lireReglagesDeVue(table)).toEqual({});
    ecrireReglagesDeVue(table, { tableau: { largeurs: { c: 200 } } });

    expect(localStorage.getItem(cleDesReglages(table))).toBe(plusRecent);
    expect(lireReglagesDeVue(table)).toEqual({ tableau: { largeurs: { c: 200 } } });
  });

  it("F-018-AC41 une section inconnue est conservée telle quelle quand l'enregistrement est réécrit : section posée, largeur changée, enregistrement relu", () => {
    const table = designation();
    const inconnue = { filtres: [{ colonne: "c", egal: "x" }], ordre: 3 };
    localStorage.setItem(
      cleDesReglages(table),
      JSON.stringify({ version: 1, sections: { "f-019": inconnue } }),
    );

    ecrireReglagesDeVue(table, { tableau: { largeurs: { c: 260 } } });

    expect(enregistre(cleDesReglages(table))).toEqual({
      version: 1,
      sections: { "f-019": inconnue, tableau: { largeurs: { c: 260 } } },
    });
  });
});

describe("effacer les réglages (F-018-AC49)", () => {
  it("F-018-AC49 les réglages des tables nommées de l'espace sont retirés, ceux d'une table de même identifiant dans un autre espace restent ; une clé absente n'est pas une erreur", () => {
    const dansA = designation(ESPACE_A);
    const dansB = { idEspace: ESPACE_B, idTable: dansA.idTable };
    const autre = designation(ESPACE_A);
    for (const table of [dansA, dansB, autre]) {
      ecrireReglagesDeVue(table, { vue: { active: "tableau" } });
    }

    effacerReglagesDeVue(ESPACE_A, [dansA.idTable, crypto.randomUUID(), "pas-un-uuid"]);

    expect(localStorage.getItem(cleDesReglages(dansA))).toBeNull();
    expect(lireReglagesDeVue(dansB)).toEqual({ vue: { active: "tableau" } });
    expect(lireReglagesDeVue(autre)).toEqual({ vue: { active: "tableau" } });
  });
});
