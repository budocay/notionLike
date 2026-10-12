import { describe, expect, it } from "vitest";

import { CHEMINS, schemaReponsePret, schemaReponseSante } from "../src/index.ts";
import type { ReponsePret, ReponseSante } from "../src/index.ts";

const REPONSE_SANTE: ReponseSante = { etat: "ok" };
const REPONSE_PRET: ReponsePret = { etat: "pret" };

describe("réponses des points de santé", () => {
  it("F-008-AC22 la réponse de GET /sante est rendue telle quelle par son schéma", () => {
    expect(schemaReponseSante.parse({ etat: "ok" })).toEqual(REPONSE_SANTE);
  });

  it("F-008-AC22 la réponse de GET /pret est rendue telle quelle par son schéma", () => {
    expect(schemaReponsePret.parse({ etat: "pret" })).toEqual(REPONSE_PRET);
  });

  it("F-008-AC22 chaque schéma refuse la réponse de l'autre route", () => {
    expect(schemaReponseSante.safeParse(REPONSE_PRET).success).toBe(false);
    expect(schemaReponsePret.safeParse(REPONSE_SANTE).success).toBe(false);
  });

  it("F-008-AC22 la réponse de GET /sante qui porte un champ en trop est refusée", () => {
    expect(schemaReponseSante.safeParse({ ...REPONSE_SANTE, version: "1" }).success).toBe(false);
  });

  it("F-008-AC22 la réponse de GET /pret qui porte un champ en trop est refusée", () => {
    expect(schemaReponsePret.safeParse({ ...REPONSE_PRET, version: "1" }).success).toBe(false);
  });
});

describe("chemins des points de santé", () => {
  it("F-008-AC22 les chemins publiés sont /sante et /pret, à la racine", () => {
    expect(CHEMINS).toEqual({ sante: "/sante", pret: "/pret" });
  });
});
