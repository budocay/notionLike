// Connexion, cookie de session et lecture de la session (F-009-AC7 à AC10, AC29), par HTTP sur
// l'application construite comme en production. Une base par fichier, des courriels par test.
import crypto from "node:crypto";

import { CHEMINS_COMPTES, schemaCompte, schemaCompteNatif } from "@notionlike/contrats";
import type { Base } from "@notionlike/db";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { arreterLesServeurs, enveloppeDe, lancerServeur, SECRET_D_ESSAI } from "./aides.ts";
import {
  DELAI_DES_COMPTES_MS,
  compteDe,
  connecter,
  cookiePose,
  cookieSigne,
  corpsUnique,
  courrielUnique,
  fermerLesBases,
  identifiantsDe,
  inscrire,
  jetonEtSignatureDe,
  lire,
  NOM_DU_COOKIE,
  NOM_DU_COOKIE_SECURISE,
  ouvertureDe,
  ouvrirUneBase,
  poseUnCookieDeSession,
  poster,
  SEPT_JOURS_S,
  sessionDuJeton,
  sessionsDe,
} from "./aides-comptes.ts";

const schemaSessionNative = z.looseObject({
  session: z.looseObject({ id: z.uuid(), userId: z.uuid(), token: z.string() }),
  user: schemaCompteNatif,
});

let base: Base;

beforeAll(async () => {
  base = await ouvrirUneBase();
}, DELAI_DES_COMPTES_MS);
afterEach(async () => {
  vi.restoreAllMocks();
  await arreterLesServeurs();
});
afterAll(fermerLesBases);

describe("connexion", () => {
  it(
    "F-009-AC7 F-009-AC22 ouvre une nouvelle session, pose le cookie, répond 200 avec le corps natif sans mot de passe ni empreinte, et laisse valides les autres sessions",
    async () => {
      const serveur = await lancerServeur(base);
      const corps = corpsUnique();
      const premiere = await inscrire(serveur, corps);

      const reponse = await connecter(serveur, corps);
      const { compte, jeton, cookie, texte } = await ouvertureDe(reponse);
      const [identifiant] = await identifiantsDe(base, compte.id);

      expect(reponse.status).toBe(200);
      expect(schemaCompteNatif.parse(compte)).toMatchObject({
        id: premiere.compte.id,
        name: corps.name,
        email: corps.email,
      });
      expect(jeton).not.toBe(premiere.jeton);
      expect(jetonEtSignatureDe(cookie).jeton).toBe(jeton);
      expect((await sessionsDe(base, compte.id)).map((ligne) => ligne.token).sort()).toEqual(
        [premiere.jeton, jeton].sort(),
      );
      expect(texte).not.toContain(corps.password);
      expect(texte).not.toContain(identifiant?.password ?? "empreinte absente");
      expect(texte).not.toContain("argon2");
      for (const ouverte of [premiere.cookie, cookie]) {
        expect(await compteDe(await lire(serveur, CHEMINS_COMPTES.moi, ouverte))).toEqual({
          id: compte.id,
          nom: corps.name,
          courriel: corps.email,
        });
      }
    },
    DELAI_DES_COMPTES_MS,
  );
});

describe("connexion refusée", () => {
  // Les appels à Argon2id de node:crypto pendant `faire`, avec leurs paramètres.
  async function calculsPendant(faire: () => Promise<Response>) {
    const espion = vi.spyOn(crypto, "argon2");
    const reponse = await faire();
    const calculs = espion.mock.calls.map(([algorithme, reglages]) => ({
      algorithme,
      memoire: reglages.memory,
      passes: reglages.passes,
      fils: reglages.parallelism,
    }));
    espion.mockRestore();
    return { reponse, calculs };
  }

  it(
    "F-009-AC8 courriel inconnu et mot de passe faux : même 401, même corps natif INVALID_EMAIL_OR_PASSWORD, aucun cookie, et un calcul Argon2id aux paramètres de F-009-AC5 dans les deux cas",
    async () => {
      const serveur = await lancerServeur(base);
      const corps = corpsUnique();
      await inscrire(serveur, corps);

      const inconnu = await calculsPendant(() =>
        connecter(serveur, { email: courrielUnique("inconnu"), password: corps.password }),
      );
      const faux = await calculsPendant(() =>
        connecter(serveur, { email: corps.email, password: "un-autre-mot-de-passe" }),
      );
      const corpsInconnu: unknown = await inconnu.reponse.json();
      const corpsFaux: unknown = await faux.reponse.json();
      const attendu = { algorithme: "argon2id", memoire: 19_456, passes: 2, fils: 1 };

      expect([inconnu.reponse.status, faux.reponse.status]).toEqual([401, 401]);
      expect(corpsInconnu).toMatchObject({ code: "INVALID_EMAIL_OR_PASSWORD" });
      expect(corpsFaux).toEqual(corpsInconnu);
      expect(poseUnCookieDeSession(inconnu.reponse)).toBe(false);
      expect(poseUnCookieDeSession(faux.reponse)).toBe(false);
      expect(inconnu.calculs).toEqual([attendu]);
      expect(faux.calculs).toEqual([attendu]);
    },
    DELAI_DES_COMPTES_MS,
  );

  it(
    "F-009-AC8 le témoin : le bon mot de passe ouvre une session après un même calcul",
    async () => {
      const serveur = await lancerServeur(base);
      const corps = corpsUnique();
      await inscrire(serveur, corps);

      const bon = await calculsPendant(() => connecter(serveur, corps));

      expect(bon.reponse.status).toBe(200);
      expect(bon.calculs).toEqual([
        { algorithme: "argon2id", memoire: 19_456, passes: 2, fils: 1 },
      ]);
    },
    DELAI_DES_COMPTES_MS,
  );

  it(
    "F-009-AC8 un mot de passe de 129 caractères reçoit 400, que le compte existe ou non, sans calcul ni cookie",
    async () => {
      const serveur = await lancerServeur(base);
      const corps = corpsUnique();
      await inscrire(serveur, corps);
      const long = "x".repeat(129);

      const existant = await calculsPendant(() =>
        connecter(serveur, { email: corps.email, password: long }),
      );
      const inconnu = await calculsPendant(() =>
        connecter(serveur, { email: courrielUnique("inconnu"), password: long }),
      );
      const enveloppes = [await enveloppeDe(existant.reponse), await enveloppeDe(inconnu.reponse)];

      expect([existant.reponse.status, inconnu.reponse.status]).toEqual([400, 400]);
      expect(enveloppes.map(({ code, message }) => ({ code, message }))).toEqual([
        { code: "requete-invalide", message: enveloppes[0]?.message },
        { code: "requete-invalide", message: enveloppes[0]?.message },
      ]);
      expect([...existant.calculs, ...inconnu.calculs]).toEqual([]);
      expect(poseUnCookieDeSession(existant.reponse)).toBe(false);
    },
    DELAI_DES_COMPTES_MS,
  );
});

describe("cookie de session", () => {
  it(
    "F-009-AC9 le cookie est HttpOnly, SameSite=Lax, Path=/, sans Domain ni Secure hors production en http, et vit autant que la session",
    async () => {
      const serveur = await lancerServeur(base);
      const corps = corpsUnique();

      for (const reponse of [
        await poster(serveur, CHEMINS_COMPTES.inscription, corps),
        await connecter(serveur, corps),
      ]) {
        const { nom, attributs, paire } = cookiePose(reponse);
        const session = await sessionDuJeton(base, jetonEtSignatureDe(paire).jeton);
        const resteS = ((session?.expiresAt.getTime() ?? 0) - Date.now()) / 1000;

        expect(nom).toBe(NOM_DU_COOKIE);
        expect([...attributs].sort()).toEqual(
          ["HttpOnly", `Max-Age=${String(SEPT_JOURS_S)}`, "Path=/", "SameSite=Lax"].sort(),
        );
        expect(attributs.some((attribut) => /^(Domain|Secure)\b/i.test(attribut))).toBe(false);
        expect(Math.abs(resteS - SEPT_JOURS_S)).toBeLessThan(60);
      }
    },
    DELAI_DES_COMPTES_MS,
  );

  it(
    "F-009-AC9 avec NODE_ENV=production et une URL_PUBLIQUE en http://, le cookie est Secure et son nom préfixé __Secure-",
    async () => {
      const serveur = await lancerServeur(base, { env: { NODE_ENV: "production" } });
      const corps = corpsUnique();

      const { nom, attributs } = cookiePose(
        await poster(serveur, CHEMINS_COMPTES.inscription, corps),
      );

      expect(nom).toBe(NOM_DU_COOKIE_SECURISE);
      expect(attributs).toContain("Secure");
      expect(attributs).toEqual(expect.arrayContaining(["HttpOnly", "SameSite=Lax", "Path=/"]));
      expect(attributs.some((attribut) => /^Domain\b/i.test(attribut))).toBe(false);
    },
    DELAI_DES_COMPTES_MS,
  );

  it(
    "F-009-AC9 avec une URL_PUBLIQUE en https:// hors production, le cookie est aussi Secure et préfixé",
    async () => {
      const serveur = await lancerServeur(base, {
        env: { NODE_ENV: "development", URL_PUBLIQUE: "https://app.exemple.test" },
      });

      const reponse = await poster(serveur, CHEMINS_COMPTES.inscription, corpsUnique(), {
        Origin: "https://app.exemple.test",
      });

      expect(cookiePose(reponse).nom).toBe(NOM_DU_COOKIE_SECURISE);
      expect(cookiePose(reponse).attributs).toContain("Secure");
    },
    DELAI_DES_COMPTES_MS,
  );

  it(
    "F-009-AC9 le jeton est opaque, d'au moins 128 bits, propre à chaque session, et le cookie est signé par le secret du serveur",
    async () => {
      const serveur = await lancerServeur(base);
      const corps = corpsUnique();
      const premiere = await inscrire(serveur, corps);
      const seconde = await ouvertureDe(await connecter(serveur, corps));

      for (const { cookie, jeton, compte } of [premiere, seconde]) {
        const { signature } = jetonEtSignatureDe(cookie);
        const attendue = crypto.createHmac("sha256", SECRET_D_ESSAI).update(jeton).digest("base64");
        const autre = crypto
          .createHmac("sha256", "un-autre-secret-de-trente-deux-signes")
          .update(jeton);

        // 32 signes de 62 possibles : plus de 190 bits.
        expect(jeton).toMatch(/^[A-Za-z0-9]{32,}$/);
        for (const donnee of [compte.id, compte.id.replaceAll("-", ""), corps.email, corps.name]) {
          expect(jeton).not.toContain(donnee);
        }
        expect(signature).toBe(attendue);
        expect(signature).not.toBe(autre.digest("base64"));
      }
      expect(premiere.jeton).not.toBe(seconde.jeton);
    },
    DELAI_DES_COMPTES_MS,
  );
});

describe("lecture de la session", () => {
  it(
    "F-009-AC10 F-009-AC22 GET /api/v1/moi rend l'identifiant, le nom et le courriel du compte, au schéma strict, sans autre champ",
    async () => {
      const serveur = await lancerServeur(base);
      const corps = corpsUnique();
      const { cookie, compte } = await inscrire(serveur, corps);

      const reponse = await lire(serveur, CHEMINS_COMPTES.moi, cookie);
      const brut: unknown = await reponse.json();

      expect(reponse.status).toBe(200);
      expect(schemaCompte.parse(brut)).toEqual({
        id: compte.id,
        nom: corps.name,
        courriel: corps.email,
      });
      expect(Object.keys(brut as object).sort()).toEqual(["courriel", "id", "nom"]);
    },
    DELAI_DES_COMPTES_MS,
  );

  it(
    "F-009-AC10 GET /api/auth/get-session rend le corps natif { session, user } du compte, sans mot de passe ni empreinte",
    async () => {
      const serveur = await lancerServeur(base);
      const corps = corpsUnique();
      const { cookie, compte, jeton } = await inscrire(serveur, corps);
      const [identifiant] = await identifiantsDe(base, compte.id);

      const reponse = await lire(serveur, CHEMINS_COMPTES.session, cookie);
      const texte = await reponse.text();
      const { session, user } = schemaSessionNative.parse(JSON.parse(texte));

      expect(reponse.status).toBe(200);
      expect(user).toMatchObject({ id: compte.id, name: corps.name, email: corps.email });
      expect(session).toMatchObject({ userId: compte.id, token: jeton });
      expect(texte).not.toContain(corps.password);
      expect(texte).not.toContain(identifiant?.password ?? "empreinte absente");
      expect(texte).not.toContain("argon2");
    },
    DELAI_DES_COMPTES_MS,
  );
});

describe("jeton brut hors du cookie signé", () => {
  it.each<[string, (jeton: string) => Record<string, string>]>([
    ["comme valeur de cookie sans signature", (jeton) => ({ Cookie: `${NOM_DU_COOKIE}=${jeton}` })],
    ["dans un en-tête Authorization Bearer", (jeton) => ({ Authorization: `Bearer ${jeton}` })],
    [
      "comme valeur de cookie et dans Authorization",
      (jeton) => ({ Cookie: `${NOM_DU_COOKIE}=${jeton}`, Authorization: `Bearer ${jeton}` }),
    ],
    [
      "comme cookie préfixé __Secure- sans signature",
      (jeton) => ({ Cookie: `${NOM_DU_COOKIE_SECURISE}=${jeton}` }),
    ],
  ])(
    "F-009-AC29 le jeton du corps natif présenté %s vaut une requête sans session",
    async (_cas, enTetesDe) => {
      const serveur = await lancerServeur(base);
      const { jeton, cookie } = await inscrire(serveur, corpsUnique());

      const moi = await lire(serveur, CHEMINS_COMPTES.moi, undefined, enTetesDe(jeton));
      const session = await lire(serveur, CHEMINS_COMPTES.session, undefined, enTetesDe(jeton));
      const temoin = await lire(serveur, CHEMINS_COMPTES.moi, cookie);

      expect(moi.status).toBe(401);
      expect((await enveloppeDe(moi)).code).toBe("non-authentifie");
      expect(session.status).toBe(200);
      expect(await session.text()).toBe("null");
      expect(temoin.status).toBe(200);
      expect(cookieSigne(jeton)).toBe(cookie);
    },
    DELAI_DES_COMPTES_MS,
  );
});
