// Inscription et stockage du mot de passe (F-009-AC1 à AC5), par HTTP. Une base par fichier : chaque
// test y crée ses comptes sous des courriels qui lui sont propres.
import { CHEMINS_COMPTES, schemaCompteNatif, type CorpsInscription } from "@notionlike/contrats";
import type { Base } from "@notionlike/db";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { arreterLesServeurs, enveloppeDe, lancerServeur } from "./aides.ts";
import {
  comptesDe,
  connecter,
  corpsUnique,
  courrielUnique,
  DELAI_DES_COMPTES_MS,
  fermerLesBases,
  identifiantsDe,
  inscrire,
  ouvertureDe,
  ouvrirUneBase,
  poseUnCookieDeSession,
  poster,
  sessionsDe,
  texteDeLaBase,
} from "./aides-comptes.ts";

const FORME_PHC = /^\$argon2id\$v=19\$m=19456,t=2,p=1\$[A-Za-z0-9+/]{22}\$[A-Za-z0-9+/]{43}$/;

let base: Base;

beforeAll(async () => {
  base = await ouvrirUneBase();
}, DELAI_DES_COMPTES_MS);
afterEach(arreterLesServeurs);
afterAll(fermerLesBases);

// Le serveur d'un test, sur la base du fichier.
async function preparerUnEssai() {
  return { base, serveur: await lancerServeur(base) };
}

describe("inscription", () => {
  it(
    "F-009-AC1 F-009-AC22 crée le compte, ouvre une session, pose le cookie et répond 200 avec le corps natif, sans mot de passe ni empreinte",
    async () => {
      const { base, serveur } = await preparerUnEssai();
      const corps = corpsUnique();

      const reponse = await poster(serveur, CHEMINS_COMPTES.inscription, corps);
      const { compte, jeton, cookie, texte } = await ouvertureDe(reponse);
      const [ligneDuCompte] = await comptesDe(base, corps.email);
      const sessions = await sessionsDe(base, compte.id);
      const [identifiant] = await identifiantsDe(base, compte.id);

      expect(reponse.status).toBe(200);
      expect(schemaCompteNatif.parse(compte)).toMatchObject({
        id: ligneDuCompte?.id,
        name: corps.name,
        email: corps.email,
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
      expect(texte).not.toContain(corps.password);
      expect(identifiant?.password).toMatch(FORME_PHC);
      expect(texte).not.toContain(identifiant?.password);
      expect(texte).not.toContain("argon2");
    },
    DELAI_DES_COMPTES_MS,
  );

  it(
    "F-009-AC1 les bornes sont acceptées : nom de 1 et de 100 caractères, mot de passe de 12 et de 128",
    async () => {
      const { base, serveur } = await preparerUnEssai();
      const courte = { name: "A", email: courrielUnique(), password: "m".repeat(12) };
      const longue = { name: "n".repeat(100), email: courrielUnique(), password: "m".repeat(128) };

      const reponses = [
        await poster(serveur, CHEMINS_COMPTES.inscription, courte),
        await poster(serveur, CHEMINS_COMPTES.inscription, longue),
      ];

      expect(reponses.map(({ status }) => status)).toEqual([200, 200]);
      expect((await comptesDe(base, courte.email)).map(({ name }) => name)).toEqual(["A"]);
      expect((await comptesDe(base, longue.email)).map(({ name }) => name.length)).toEqual([100]);
    },
    DELAI_DES_COMPTES_MS,
  );

  it(
    "F-009-AC2 le courriel est enregistré en minuscules, et sa casse ne compte ni à l'inscription ni à la connexion",
    async () => {
      const { base, serveur } = await preparerUnEssai();
      const corps = corpsUnique();
      const [local = "", domaine = ""] = corps.email.split("@");

      const { compte } = await inscrire(serveur, {
        ...corps,
        email: `${local.toUpperCase()}@${domaine}`,
      });
      const doublon = await poster(serveur, CHEMINS_COMPTES.inscription, {
        ...corps,
        email: `${local}@${domaine.toUpperCase()}`,
      });
      const connexion = await connecter(serveur, { ...corps, email: corps.email.toUpperCase() });

      expect(compte.email).toBe(corps.email);
      expect((await comptesDe(base, corps.email)).map(({ email }) => email)).toEqual([corps.email]);
      expect(doublon.status).toBe(422);
      expect(connexion.status).toBe(200);
      expect((await ouvertureDe(connexion)).compte.id).toBe(compte.id);
    },
    DELAI_DES_COMPTES_MS,
  );

  it.each([
    (email: string) => ` ${email}`,
    (email: string) => `${email} `,
    (email: string) => `\t${email}`,
    (email: string) => `${email}\n`,
  ])(
    "F-009-AC2 un courriel bordé d'un blanc (cas %#) est refusé en 400 à l'inscription, sans compte ni session",
    async (border) => {
      const { base, serveur } = await preparerUnEssai();
      const corps = corpsUnique();

      const reponse = await poster(serveur, CHEMINS_COMPTES.inscription, {
        ...corps,
        email: border(corps.email),
      });

      expect(reponse.status).toBe(400);
      expect((await enveloppeDe(reponse)).code).toBe("requete-invalide");
      expect(poseUnCookieDeSession(reponse)).toBe(false);
      expect(await comptesDe(base, corps.email)).toEqual([]);
    },
    DELAI_DES_COMPTES_MS,
  );

  it.each([(email: string) => ` ${email}`, (email: string) => `${email} `])(
    "F-009-AC2 un courriel bordé d'un blanc (cas %#) est refusé en 400 à la connexion, sans corriger ni ouvrir de session",
    async (border) => {
      const { base, serveur } = await preparerUnEssai();
      const corps = corpsUnique();
      const { compte } = await inscrire(serveur, corps);

      const reponse = await connecter(serveur, { ...corps, email: border(corps.email) });

      expect(reponse.status).toBe(400);
      expect((await enveloppeDe(reponse)).code).toBe("requete-invalide");
      expect(poseUnCookieDeSession(reponse)).toBe(false);
      expect(await sessionsDe(base, compte.id)).toHaveLength(1);
    },
    DELAI_DES_COMPTES_MS,
  );

  it(
    "F-009-AC3 un courriel déjà pris répond 422 USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL, sans second compte, sans toucher au premier ni ouvrir de session",
    async () => {
      const { base, serveur } = await preparerUnEssai();
      const corps = corpsUnique();
      await inscrire(serveur, corps);
      const avant = await texteDeLaBase(base);

      const reponse = await poster(serveur, CHEMINS_COMPTES.inscription, {
        name: "Une autre",
        email: corps.email,
        password: "un-autre-mot-de-passe",
      });

      expect(reponse.status).toBe(422);
      expect(await reponse.json()).toMatchObject({ code: "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL" });
      expect(poseUnCookieDeSession(reponse)).toBe(false);
      expect(await comptesDe(base, corps.email)).toHaveLength(1);
      expect(await texteDeLaBase(base)).toBe(avant);
      expect((await connecter(serveur, corps)).status).toBe(200);
    },
    DELAI_DES_COMPTES_MS,
  );
});

describe("corps d'inscription refusé", () => {
  const MOT_DE_PASSE_FAUTIF = "x".repeat(129);

  it.each<[string, (corps: CorpsInscription) => Record<string, unknown>]>([
    ["nom absent", ({ email, password }) => ({ email, password })],
    ["nom vide", (corps) => ({ ...corps, name: "" })],
    ["nom fait de blancs", (corps) => ({ ...corps, name: "  \t " })],
    ["nom de 101 caractères", (corps) => ({ ...corps, name: "n".repeat(101) })],
    ["courriel absent", ({ name, password }) => ({ name, password })],
    ["courriel invalide", (corps) => ({ ...corps, email: corps.email.replace("@", ".") })],
    [
      "courriel de 255 caractères",
      (corps) => ({ ...corps, email: `${"a".repeat(255 - corps.email.length)}${corps.email}` }),
    ],
    ["mot de passe absent", ({ name, email }) => ({ name, email })],
    ["mot de passe de 11 caractères", (corps) => ({ ...corps, password: "x".repeat(11) })],
    ["mot de passe de 129 caractères", (corps) => ({ ...corps, password: MOT_DE_PASSE_FAUTIF })],
  ])(
    "F-009-AC4 F-009-AC22 %s : 400 requete-invalide, aucun compte, mot de passe absent de la réponse",
    async (_cas, fautif) => {
      const { base, serveur } = await preparerUnEssai();
      const corps = corpsUnique();
      const envoye = fautif(corps);

      const reponse = await poster(serveur, CHEMINS_COMPTES.inscription, envoye);
      const texte = await reponse.clone().text();

      expect(reponse.status).toBe(400);
      expect((await enveloppeDe(reponse)).code).toBe("requete-invalide");
      expect(texte).not.toContain(String(envoye.password ?? corps.password));
      expect(await comptesDe(base, corps.email)).toEqual([]);
      expect(await comptesDe(base, String(envoye.email))).toEqual([]);
    },
    DELAI_DES_COMPTES_MS,
  );

  it.each<[string, (corps: CorpsInscription) => RequestInit]>([
    ["sans corps", () => ({})],
    ["JSON illisible", (corps) => ({ body: JSON.stringify(corps).slice(0, -1) })],
    ["tableau", (corps) => ({ body: JSON.stringify([corps]) })],
    [
      "corps valide annoncé en text/plain",
      (corps) => ({ body: JSON.stringify(corps), headers: { "Content-Type": "text/plain" } }),
    ],
  ])(
    "F-009-AC4 %s : 400 requete-invalide, aucun compte",
    async (_cas, envoi) => {
      const { base, serveur } = await preparerUnEssai();
      const corps = corpsUnique();

      const reponse = await fetch(`${serveur.url}${CHEMINS_COMPTES.inscription}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        ...envoi(corps),
      });

      expect(reponse.status).toBe(400);
      expect((await enveloppeDe(reponse)).code).toBe("requete-invalide");
      expect(await comptesDe(base, corps.email)).toEqual([]);
    },
    DELAI_DES_COMPTES_MS,
  );

  it(
    "F-009-AC4 le témoin : le même corps, sans la faute, crée le compte",
    async () => {
      const { base, serveur } = await preparerUnEssai();
      const corps = corpsUnique();

      const reponse = await poster(serveur, CHEMINS_COMPTES.inscription, corps);

      expect(reponse.status).toBe(200);
      expect(await comptesDe(base, corps.email)).toHaveLength(1);
    },
    DELAI_DES_COMPTES_MS,
  );
});

describe("stockage du mot de passe", () => {
  it(
    "F-009-AC5 seule une empreinte Argon2id au format PHC est stockée ; deux comptes au même mot de passe ont deux empreintes ; le clair n'est ni en base ni au journal",
    async () => {
      const { base, serveur } = await preparerUnEssai();
      const corps = corpsUnique();

      const premier = await inscrire(serveur, corps);
      const second = await inscrire(serveur, { ...corpsUnique(), name: "Grace Hopper" });
      const empreintes = [
        ...(await identifiantsDe(base, premier.compte.id)),
        ...(await identifiantsDe(base, second.compte.id)),
      ].map((ligne) => ligne.password ?? "");

      expect(empreintes).toHaveLength(2);
      expect(empreintes.filter((empreinte) => FORME_PHC.test(empreinte))).toHaveLength(2);
      expect(empreintes[0]).not.toBe(empreintes[1]);
      expect(empreintes.filter((empreinte) => /^[0-9a-f]+:[0-9a-f]+$/.test(empreinte))).toEqual([]);
      expect(await texteDeLaBase(base)).not.toContain(corps.password);
      expect(serveur.texteDuJournal()).not.toContain(corps.password);
    },
    DELAI_DES_COMPTES_MS,
  );
});
