// Règle des adresses, fonction pure (F-028-AC11), et complément d'une saisie sans schéma
// (F-028-AC8).
import { describe, expect, it, vi } from "vitest";

import { adresseAcceptee, adresseDUneSaisie } from "../../src/edition/index.ts";
import { ADRESSES_ACCEPTEES, ADRESSES_REFUSEES } from "./aides-adresses.ts";

describe("règle des adresses", () => {
  it.each(ADRESSES_REFUSEES)("F-028-AC11 %s est refusée", (_nom, valeur) => {
    expect(adresseAcceptee(valeur)).toBeUndefined();
  });

  it.each(ADRESSES_ACCEPTEES)(
    "F-028-AC11 %s est acceptée, et rend la forme sérialisée par l'analyseur",
    (_nom, valeur, normalisee) => {
      expect(adresseAcceptee(valeur)).toBe(normalisee);
      expect(adresseAcceptee(normalisee)).toBe(normalisee);
    },
  );

  it("F-028-AC11 la règle n'emploie ni DOM ni réseau : elle décide sans document et sans fetch", () => {
    vi.stubGlobal("document", undefined);
    vi.stubGlobal("fetch", () => {
      throw new Error("réseau");
    });
    try {
      expect(adresseAcceptee("https://exemple.fr/")).toBe("https://exemple.fr/");
      expect(adresseAcceptee("javascript:alert(1)")).toBeUndefined();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("saisie d'une adresse dans le panneau", () => {
  it.each([
    ["exemple.fr", "https://exemple.fr/"],
    ["exemple.fr/a?b#c", "https://exemple.fr/a?b#c"],
    ["prenom@exemple.fr", "mailto:prenom@exemple.fr"],
    ["  exemple.fr  ", "https://exemple.fr/"],
    ["http://intranet/page", "http://intranet/page"],
  ])("F-028-AC8 « %s » sans schéma est complétée puis normalisée en %s", (saisie, attendue) => {
    expect(adresseDUneSaisie(saisie)).toBe(attendue);
  });

  it.each([
    ["vide", ""],
    ["blanche", "   "],
    ["qui commence par /", "/chemin"],
    ["qui commence par ?", "?q=1"],
    ["qui commence par #", "#ancre"],
    ["au schéma refusé", "javascript:alert(1)"],
    ["lue comme un schéma inconnu", "localhost:3000"],
    ["à deux @, complétée en https puis refusée", "a@b@exemple.fr"],
  ])("F-028-AC8 F-028-AC12 une saisie %s est refusée", (_nom, saisie) => {
    expect(adresseDUneSaisie(saisie)).toBeUndefined();
  });
});
