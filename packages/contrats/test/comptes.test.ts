import { describe, expect, it } from "vitest";

import {
  CHEMINS_COMPTES,
  schemaCompte,
  schemaCompteNatif,
  schemaCorpsConnexion,
  schemaCorpsInscription,
} from "../src/index.ts";
import type { Compte, CorpsConnexion, CorpsInscription } from "../src/index.ts";

const INSCRIPTION: CorpsInscription = {
  name: "Ada Lovelace",
  email: "ada@exemple.test",
  password: "douze-signes",
};
const CONNEXION: CorpsConnexion = { email: INSCRIPTION.email, password: "faux" };
const COMPTE: Compte = {
  id: "3f0e7a52-9f4f-4b7e-8a51-1c1f0d6f2b11",
  nom: "Ada Lovelace",
  courriel: "ada@exemple.test",
};
const COMPTE_NATIF = { id: COMPTE.id, name: COMPTE.nom, email: COMPTE.courriel };

// 254 caractères exactement : la borne haute d'un courriel.
const COURRIEL_DE_254 = `${"a".repeat(64)}@${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(56)}.test`;

function inscriptionAcceptee(retouche: Partial<Record<keyof CorpsInscription, unknown>>): boolean {
  return schemaCorpsInscription.safeParse({ ...INSCRIPTION, ...retouche }).success;
}

function connexionAcceptee(retouche: Partial<Record<keyof CorpsConnexion, unknown>>): boolean {
  return schemaCorpsConnexion.safeParse({ ...CONNEXION, ...retouche }).success;
}

describe("chemins des comptes", () => {
  it("F-009-AC22 les quatre routes d'authentification et GET /api/v1/moi sont publiées", () => {
    expect(CHEMINS_COMPTES).toEqual({
      inscription: "/api/auth/sign-up/email",
      connexion: "/api/auth/sign-in/email",
      deconnexion: "/api/auth/sign-out",
      session: "/api/auth/get-session",
      moi: "/api/v1/moi",
    });
  });
});

describe("corps d'inscription", () => {
  it("F-009-AC22 F-009-AC4 un corps aux bornes est rendu tel quel", () => {
    const auxBornes = {
      name: "n".repeat(100),
      email: COURRIEL_DE_254,
      password: "m".repeat(128),
    };

    expect(COURRIEL_DE_254).toHaveLength(254);
    expect(schemaCorpsInscription.parse(auxBornes)).toEqual(auxBornes);
    expect(schemaCorpsInscription.parse(INSCRIPTION)).toEqual(INSCRIPTION);
    expect(INSCRIPTION.password).toHaveLength(12);
  });

  it.each([
    ["nom absent", { name: undefined }],
    ["nom vide", { name: "" }],
    ["nom fait de blancs", { name: " \t\n" }],
    ["nom de 101 caractères", { name: "n".repeat(101) }],
    ["nom qui n'est pas un texte", { name: 12 }],
    ["courriel absent", { email: undefined }],
    ["courriel sans arobase", { email: "ada.exemple.test" }],
    ["courriel de 255 caractères", { email: `a${COURRIEL_DE_254}` }],
    ["mot de passe absent", { password: undefined }],
    ["mot de passe de 11 caractères", { password: "m".repeat(11) }],
    ["mot de passe de 129 caractères", { password: "m".repeat(129) }],
  ])("F-009-AC4 le corps d'inscription est refusé : %s", (_cas, retouche) => {
    expect(inscriptionAcceptee(retouche)).toBe(false);
  });

  it.each([" ada@exemple.test", "ada@exemple.test ", "\tada@exemple.test", "ada@exemple.test\n"])(
    "F-009-AC2 un courriel bordé d'un blanc (%j) est refusé à l'inscription et à la connexion",
    (email) => {
      expect(inscriptionAcceptee({ email })).toBe(false);
      expect(connexionAcceptee({ email })).toBe(false);
    },
  );

  it("F-009-AC2 un courriel en majuscules est accepté, sans être corrigé par le schéma", () => {
    const email = "Ada@Exemple.TEST";

    expect(schemaCorpsInscription.parse({ ...INSCRIPTION, email }).email).toBe(email);
    expect(schemaCorpsConnexion.parse({ ...CONNEXION, email }).email).toBe(email);
  });

  it("F-009-AC4 un champ hors du contrat n'est pas transmis", () => {
    const lu = schemaCorpsInscription.parse({ ...INSCRIPTION, rememberMe: false, image: "x" });

    expect(lu).toEqual(INSCRIPTION);
  });
});

describe("corps de connexion", () => {
  it("F-009-AC8 un mot de passe de 128 caractères passe, de 129 est refusé", () => {
    expect(connexionAcceptee({ password: "m".repeat(128) })).toBe(true);
    expect(connexionAcceptee({ password: "m".repeat(129) })).toBe(false);
  });

  it("F-009-AC8 un mot de passe plus court que la politique reste un corps valide", () => {
    expect(schemaCorpsConnexion.parse(CONNEXION)).toEqual(CONNEXION);
  });

  it.each([
    ["courriel absent", { email: undefined }],
    ["courriel invalide", { email: "ada" }],
    ["mot de passe absent", { password: undefined }],
  ])("F-009-AC22 le corps de connexion est refusé : %s", (_cas, retouche) => {
    expect(connexionAcceptee(retouche)).toBe(false);
  });
});

describe("compte", () => {
  it("F-009-AC22 F-009-AC10 le compte de GET /api/v1/moi est rendu tel quel", () => {
    expect(schemaCompte.parse(COMPTE)).toEqual(COMPTE);
  });

  it.each(["id", "nom", "courriel"] as const)(
    "F-009-AC22 le compte sans le champ %s est refusé",
    (champ) => {
      const incomplet: Partial<Compte> = { ...COMPTE };
      delete incomplet[champ];

      expect(schemaCompte.safeParse(incomplet).success).toBe(false);
    },
  );

  it("F-009-AC10 le compte qui porte un champ en trop est refusé par le schéma strict", () => {
    expect(schemaCompte.safeParse({ ...COMPTE, emailVerified: false }).success).toBe(false);
  });

  it("F-009-AC22 le compte natif garde les champs que better-auth ajoute", () => {
    const natif = { ...COMPTE_NATIF, image: null, emailVerified: false };

    expect(schemaCompteNatif.parse(natif)).toEqual(natif);
  });

  it.each(["id", "name", "email"] as const)(
    "F-009-AC22 le compte natif sans le champ %s est refusé",
    (champ) => {
      const incomplet: Partial<typeof COMPTE_NATIF> = { ...COMPTE_NATIF };
      delete incomplet[champ];

      expect(schemaCompteNatif.safeParse(incomplet).success).toBe(false);
    },
  );
});
