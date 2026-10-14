// Contrôle de l'origine des écritures (F-011-AC26), extrait d'`espaces.ts` dans `origine.ts` pour
// être partagé avec la gestion du compte (F-027-AC16). Son comportement est constaté ici sur des
// requêtes d'Express ; ses appelants sont énumérés, et chacun a ses tests de bout en bout
// (`droits.test.ts` pour F-011, `gestion-du-compte.test.ts` pour F-027).
import { readdirSync, readFileSync } from "node:fs";

import type { Request } from "express";
import { describe, expect, it } from "vitest";

import { origineAdmise } from "../src/origine.ts";

const SRC = new URL("../src/", import.meta.url);
const ORIGINES = {
  urlPublique: "http://app.exemple.test",
  originesAutorisees: ["http://autorisee.exemple.test"],
};

function requete(methode: string, origine?: string): Request {
  return {
    method: methode,
    get: (nom: string) => (nom.toLowerCase() === "origin" ? origine : undefined),
  } as unknown as Request;
}

// Les fichiers d'`apps/server/src` qui appellent le contrôle, et ceux qui lisent `Origin` eux-mêmes.
function appelants(): { appellent: string[]; lisentOrigin: string[] } {
  const fichiers = readdirSync(SRC).map((nom) => [nom, readFileSync(new URL(nom, SRC), "utf8")]);
  return {
    appellent: fichiers
      .filter(([, texte]) => /(?<!function )\borigineAdmise\(/.test(texte ?? ""))
      .map(([nom]) => nom ?? "")
      .sort(),
    lisentOrigin: fichiers
      .filter(([, texte]) => /\.get\(\s*"Origin"\s*\)/i.test(texte ?? ""))
      .map(([nom]) => nom ?? "")
      .sort(),
  };
}

describe("contrôle de l'origine partagé (F-011-AC26, F-027-AC16)", () => {
  it.each([
    ["POST", "http://ailleurs.exemple.test", false],
    ["PATCH", "http://ailleurs.exemple.test", false],
    ["DELETE", "null", false],
    ["POST", "http://app.exemple.test", true],
    ["PATCH", "http://autorisee.exemple.test", true],
    ["POST", undefined, true],
    ["GET", "http://ailleurs.exemple.test", true],
  ])(
    "F-011-AC26 F-027-AC16 %s avec l'origine %s : admise = %s, comme avant l'extraction",
    (methode, origine, admise) => {
      expect(origineAdmise(ORIGINES, requete(methode, origine))).toBe(admise);
    },
  );

  it("F-027-AC16 F-027-AC20 le contrôle a un seul module, et ses appelants sont énumérés", () => {
    expect(appelants()).toEqual({
      appellent: ["espaces.ts", "gestion-du-compte.ts"],
      lisentOrigin: ["origine.ts"],
    });
  });
});
