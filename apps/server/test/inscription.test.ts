import { CHEMINS_COMPTES, schemaCompteNatif } from "@notionlike/contrats";
import { afterEach, describe, expect, it } from "vitest";

import { arreterLesServeurs, enveloppeDe } from "./aides.ts";
import {
  ADA,
  connecter,
  fermerLesBases,
  inscrire,
  lignesDe,
  ouvertureDe,
  poseUnCookieDeSession,
  poster,
  preparerUnEssai,
  texteDeLaBase,
} from "./aides-comptes.ts";

const FORME_PHC = /^\$argon2id\$v=19\$m=19456,t=2,p=1\$[A-Za-z0-9+/]{22}\$[A-Za-z0-9+/]{43}$/;

afterEach(async () => {
  await arreterLesServeurs();
  await fermerLesBases();
});

describe("inscription", () => {
  it("F-009-AC1 crée le compte, ouvre une session, pose le cookie et répond 200 avec le corps natif, sans mot de passe ni empreinte", async () => {
    const { base, serveur } = await preparerUnEssai();

    const reponse = await poster(serveur, CHEMINS_COMPTES.inscription, ADA);
    const { compte, jeton, cookie, texte } = await ouvertureDe(reponse);
    const [ligneDuCompte] = await lignesDe(base, "user");
    const sessions = await lignesDe(base, "session");
    const [identifiant] = await lignesDe(base, "account");

    expect(reponse.status).toBe(200);
    expect(schemaCompteNatif.parse(compte)).toMatchObject({
      id: ligneDuCompte?.id,
      name: ADA.name,
      email: ADA.email,
      image: null,
      emailVerified: false,
    });
    expect(Object.keys(compte).sort()).toEqual(
      ["createdAt", "email", "emailVerified", "id", "image", "name", "updatedAt"].sort(),
    );
    expect(sessions.map((session) => [session.token, session.userId])).toEqual([
      [jeton, compte.id],
    ]);
    expect(cookie).toContain(`=${jeton}.`);
    expect(texte).not.toContain(ADA.password);
    expect(identifiant?.password).toMatch(FORME_PHC);
    expect(texte).not.toContain(identifiant?.password);
    expect(texte).not.toContain("argon2");
  });

  it("F-009-AC1 les bornes sont acceptées : nom de 1 et de 100 caractères, mot de passe de 12 et de 128", async () => {
    const { base, serveur } = await preparerUnEssai();

    const courte = await poster(serveur, CHEMINS_COMPTES.inscription, {
      name: "A",
      email: "a@exemple.test",
      password: "m".repeat(12),
    });
    const longue = await poster(serveur, CHEMINS_COMPTES.inscription, {
      name: "n".repeat(100),
      email: "b@exemple.test",
      password: "m".repeat(128),
    });

    expect([courte.status, longue.status]).toEqual([200, 200]);
    expect((await lignesDe(base, "user")).map((ligne) => ligne.name.length).sort()).toEqual([
      1, 100,
    ]);
  });

  it("F-009-AC2 le courriel est enregistré en minuscules, et sa casse ne compte ni à l'inscription ni à la connexion", async () => {
    const { base, serveur } = await preparerUnEssai();

    const { compte } = await inscrire(serveur, { ...ADA, email: "Ada@Exemple.TEST" });
    const doublon = await poster(serveur, CHEMINS_COMPTES.inscription, {
      ...ADA,
      email: "ADA@exemple.test",
    });
    const connexion = await connecter(serveur, { ...ADA, email: "aDa@EXEMPLE.test" });

    expect(compte.email).toBe("ada@exemple.test");
    expect((await lignesDe(base, "user")).map((ligne) => ligne.email)).toEqual([
      "ada@exemple.test",
    ]);
    expect(doublon.status).toBe(422);
    expect(connexion.status).toBe(200);
    expect((await ouvertureDe(connexion)).compte.id).toBe(compte.id);
  });

  it.each([" ada@exemple.test", "ada@exemple.test ", "\tada@exemple.test", "ada@exemple.test\n"])(
    "F-009-AC2 un courriel bordé d'un blanc (%j) est refusé en 400 à l'inscription, sans compte ni session",
    async (email) => {
      const { base, serveur } = await preparerUnEssai();

      const reponse = await poster(serveur, CHEMINS_COMPTES.inscription, { ...ADA, email });

      expect(reponse.status).toBe(400);
      expect((await enveloppeDe(reponse)).code).toBe("requete-invalide");
      expect(poseUnCookieDeSession(reponse)).toBe(false);
      expect(await lignesDe(base, "user")).toEqual([]);
      expect(await lignesDe(base, "session")).toEqual([]);
    },
  );

  it.each([" ada@exemple.test", "ada@exemple.test "])(
    "F-009-AC2 un courriel bordé d'un blanc (%j) est refusé en 400 à la connexion, sans corriger ni ouvrir de session",
    async (email) => {
      const { base, serveur } = await preparerUnEssai();
      await inscrire(serveur);

      const reponse = await connecter(serveur, { ...ADA, email });

      expect(reponse.status).toBe(400);
      expect((await enveloppeDe(reponse)).code).toBe("requete-invalide");
      expect(poseUnCookieDeSession(reponse)).toBe(false);
      expect(await lignesDe(base, "session")).toHaveLength(1);
    },
  );

  it("F-009-AC3 un courriel déjà pris répond 422 USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL, sans second compte, sans toucher au premier ni ouvrir de session", async () => {
    const { base, serveur } = await preparerUnEssai();
    await inscrire(serveur);
    const avant = await texteDeLaBase(base);

    const reponse = await poster(serveur, CHEMINS_COMPTES.inscription, {
      name: "Une autre",
      email: ADA.email,
      password: "un-autre-mot-de-passe",
    });

    expect(reponse.status).toBe(422);
    expect(await reponse.json()).toMatchObject({ code: "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL" });
    expect(poseUnCookieDeSession(reponse)).toBe(false);
    expect(await lignesDe(base, "user")).toHaveLength(1);
    expect(await texteDeLaBase(base)).toBe(avant);
    expect((await connecter(serveur)).status).toBe(200);
  });
});

describe("corps d'inscription refusé", () => {
  const MOT_DE_PASSE_FAUTIF = "x".repeat(129);

  it.each<[string, Record<string, unknown>]>([
    ["nom absent", { email: ADA.email, password: ADA.password }],
    ["nom vide", { ...ADA, name: "" }],
    ["nom fait de blancs", { ...ADA, name: "  \t " }],
    ["nom de 101 caractères", { ...ADA, name: "n".repeat(101) }],
    ["courriel absent", { name: ADA.name, password: ADA.password }],
    ["courriel invalide", { ...ADA, email: "ada.exemple.test" }],
    ["courriel de 255 caractères", { ...ADA, email: `${"a".repeat(243)}@exemple.test` }],
    ["mot de passe absent", { name: ADA.name, email: ADA.email }],
    ["mot de passe de 11 caractères", { ...ADA, password: "x".repeat(11) }],
    ["mot de passe de 129 caractères", { ...ADA, password: MOT_DE_PASSE_FAUTIF }],
  ])(
    "F-009-AC4 %s : 400 requete-invalide, aucun compte, mot de passe absent de la réponse",
    async (_cas, corps) => {
      const { base, serveur } = await preparerUnEssai();

      const reponse = await poster(serveur, CHEMINS_COMPTES.inscription, corps);
      const texte = await reponse.clone().text();

      expect(reponse.status).toBe(400);
      expect((await enveloppeDe(reponse)).code).toBe("requete-invalide");
      expect(texte).not.toContain(String(corps.password));
      expect(await lignesDe(base, "user")).toEqual([]);
      expect(await lignesDe(base, "account")).toEqual([]);
    },
  );

  it.each<[string, RequestInit]>([
    ["sans corps", {}],
    [
      "JSON illisible",
      { body: `{"name":"Ada","email":"${ADA.email}","password":"${ADA.password}"` },
    ],
    ["tableau", { body: JSON.stringify([ADA]) }],
    [
      "corps valide annoncé en text/plain",
      { body: JSON.stringify(ADA), headers: { "Content-Type": "text/plain" } },
    ],
  ])("F-009-AC4 %s : 400 requete-invalide, aucun compte", async (_cas, envoi) => {
    const { base, serveur } = await preparerUnEssai();

    const reponse = await fetch(`${serveur.url}${CHEMINS_COMPTES.inscription}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      ...envoi,
    });

    expect(reponse.status).toBe(400);
    expect((await enveloppeDe(reponse)).code).toBe("requete-invalide");
    expect(await lignesDe(base, "user")).toEqual([]);
  });

  it("F-009-AC4 le témoin : le même corps, sans la faute, crée le compte", async () => {
    const { base, serveur } = await preparerUnEssai();

    const reponse = await poster(serveur, CHEMINS_COMPTES.inscription, ADA);

    expect(reponse.status).toBe(200);
    expect(await lignesDe(base, "user")).toHaveLength(1);
  });
});

describe("stockage du mot de passe", () => {
  it("F-009-AC5 seule une empreinte Argon2id au format PHC est stockée ; deux comptes au même mot de passe ont deux empreintes ; le clair n'est ni en base ni au journal", async () => {
    const { base, serveur } = await preparerUnEssai();

    await inscrire(serveur);
    await inscrire(serveur, { ...ADA, name: "Grace Hopper", email: "grace@exemple.test" });
    const empreintes = (await lignesDe(base, "account")).map((ligne) => ligne.password ?? "");

    expect(empreintes).toHaveLength(2);
    expect(empreintes.filter((empreinte) => FORME_PHC.test(empreinte))).toHaveLength(2);
    expect(empreintes[0]).not.toBe(empreintes[1]);
    expect(empreintes.filter((empreinte) => /^[0-9a-f]+:[0-9a-f]+$/.test(empreinte))).toEqual([]);
    expect(await texteDeLaBase(base)).not.toContain(ADA.password);
    expect(serveur.texteDuJournal()).not.toContain(ADA.password);
  });
});
