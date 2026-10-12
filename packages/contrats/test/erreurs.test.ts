import { describe, expect, it } from "vitest";

import { CODES_ERREUR, schemaEnveloppeErreur } from "../src/index.ts";
import type { CodeErreur, EnveloppeErreur } from "../src/index.ts";

const CONVENTION_DES_CODES = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const CODES_DE_LA_SPEC: readonly CodeErreur[] = [
  "requete-invalide",
  "ressource-introuvable",
  "corps-trop-grand",
  "base-indisponible",
  "erreur-interne",
];

const CODES_MAL_FORMES = [
  ["un tiret bas", "requete_invalide"],
  ["une majuscule", "Requete-invalide"],
  ["un accent", "requête-invalide"],
  ["un tiret en tête", "-requete-invalide"],
  ["un tiret en fin", "requete-invalide-"],
  ["un tiret doublé", "requete--invalide"],
] as const;

const ENVELOPPE: EnveloppeErreur = {
  code: "base-indisponible",
  message: "La base de données est indisponible.",
  idRequete: "requete-1",
};

function accepte(valeur: unknown): boolean {
  return schemaEnveloppeErreur.safeParse(valeur).success;
}

function suitLaConvention(code: string): boolean {
  return CONVENTION_DES_CODES.test(code);
}

describe("liste fermée des codes d'erreur", () => {
  it("F-008-AC22 la liste publiée est exactement celle des cinq codes de la spec", () => {
    expect([...CODES_ERREUR]).toEqual(CODES_DE_LA_SPEC);
  });

  it("F-008-AC22 aucun code publié n'échappe à la convention", () => {
    expect(CODES_ERREUR.filter((code) => !suitLaConvention(code))).toEqual([]);
  });

  it.each(CODES_MAL_FORMES)("F-008-AC22 la convention refuse %s (%s)", (_defaut, code) => {
    expect(suitLaConvention(code)).toBe(false);
  });
});

describe("schéma de l'enveloppe d'erreur", () => {
  it.each(CODES_DE_LA_SPEC)("F-008-AC22 l'enveloppe de code %s est rendue telle quelle", (code) => {
    const enveloppe = { ...ENVELOPPE, code };
    expect(schemaEnveloppeErreur.parse(enveloppe)).toEqual(enveloppe);
  });

  it.each(["code", "message", "idRequete"] as const)(
    "F-008-AC22 l'enveloppe sans le champ %s est refusée",
    (champ) => {
      const incomplete: Partial<EnveloppeErreur> = { ...ENVELOPPE };
      delete incomplete[champ];
      expect(accepte(incomplete)).toBe(false);
    },
  );

  it("F-008-AC22 l'enveloppe qui porte un champ en trop est refusée", () => {
    expect(accepte({ ...ENVELOPPE, pile: "Error: at application.ts" })).toBe(false);
  });

  it.each(["message", "idRequete"] as const)(
    "F-008-AC22 l'enveloppe dont le champ %s est vide est refusée",
    (champ) => {
      expect(accepte({ ...ENVELOPPE, [champ]: "" })).toBe(false);
    },
  );

  it.each(CODES_DE_LA_SPEC)(
    "F-008-AC22 le code %s dont un tiret devient un tiret bas est refusé",
    (code) => {
      const codeAuTiretBas = code.replace("-", "_");
      expect(accepte({ ...ENVELOPPE, code: codeAuTiretBas })).toBe(false);
    },
  );

  it.each(CODES_MAL_FORMES)("F-008-AC22 le code qui porte %s (%s) est refusé", (_defaut, code) => {
    expect(accepte({ ...ENVELOPPE, code })).toBe(false);
  });

  it("F-008-AC22 un code bien formé mais hors de la liste est refusé", () => {
    expect(accepte({ ...ENVELOPPE, code: "code-inconnu" })).toBe(false);
  });
});
