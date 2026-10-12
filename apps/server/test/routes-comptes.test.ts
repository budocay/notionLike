// Ce que le serveur tient devant better-auth : contrôle d'origine, liste fermée des routes, taille
// du corps, URL publique, aucune ouverture entre origines, en-têtes de F-008 (F-009-AC16, AC17,
// AC23, AC28, AC30, AC32).
import { CHEMINS, CHEMINS_COMPTES } from "@notionlike/contrats";
import type { Base } from "@notionlike/db";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  arreterLesServeurs,
  enveloppeDe,
  lancerServeur,
  URL_PUBLIQUE_D_ESSAI,
  type ServeurDEssai,
} from "./aides.ts";
import {
  DELAI_DES_COMPTES_MS,
  comptesDe,
  connecter,
  cookiePose,
  corpsUnique,
  deconnecter,
  envoyer,
  enTetesDOuverture,
  fermerLesBases,
  inscrire,
  lire,
  NOM_DU_COOKIE,
  ouvrirUneBase,
  poseUnCookieDeSession,
  poster,
  sessionDuJeton,
  sessionsDe,
} from "./aides-comptes.ts";

const ORIGINE_ETRANGERE = "http://ailleurs.exemple.test";
const ORIGINE_AUTORISEE = "http://autorisee.exemple.test";
const LIMITE = 100_000;

let base: Base;

beforeAll(async () => {
  base = await ouvrirUneBase();
}, DELAI_DES_COMPTES_MS);
afterEach(arreterLesServeurs);
afterAll(fermerLesBases);

describe("contrôle de l'origine", () => {
  it.each([ORIGINE_ETRANGERE, "null", "http://app.exemple.test:8080", "https://app.exemple.test"])(
    "F-009-AC16 sous NODE_ENV=test, une inscription d'origine %s reçoit 403 sans compte ni cookie",
    async (origine) => {
      expect(process.env.NODE_ENV).toBe("test");
      const serveur = await lancerServeur(base);
      const corps = corpsUnique();

      const reponse = await poster(serveur, CHEMINS_COMPTES.inscription, corps, {
        Origin: origine,
      });

      expect(reponse.status).toBe(403);
      expect(await reponse.json()).toMatchObject({
        code: origine === "null" ? "MISSING_OR_NULL_ORIGIN" : "INVALID_ORIGIN",
      });
      expect(reponse.headers.getSetCookie()).toEqual([]);
      expect(await comptesDe(base, corps.email)).toEqual([]);
    },
    DELAI_DES_COMPTES_MS,
  );

  it(
    "F-009-AC16 une connexion d'une origine étrangère reçoit 403 sans ouvrir de session ni poser de cookie",
    async () => {
      const serveur = await lancerServeur(base);
      const corps = corpsUnique();
      const { compte } = await inscrire(serveur, corps);

      const reponse = await connecter(serveur, corps, { Origin: ORIGINE_ETRANGERE });

      expect(reponse.status).toBe(403);
      expect(reponse.headers.getSetCookie()).toEqual([]);
      expect(await sessionsDe(base, compte.id)).toHaveLength(1);
    },
    DELAI_DES_COMPTES_MS,
  );

  it(
    "F-009-AC16 une déconnexion d'une origine étrangère reçoit 403 sans fermer la session ni toucher au cookie",
    async () => {
      const serveur = await lancerServeur(base);
      const { cookie, jeton } = await inscrire(serveur, corpsUnique());

      const reponse = await deconnecter(serveur, cookie, { Origin: ORIGINE_ETRANGERE });

      expect(reponse.status).toBe(403);
      expect(reponse.headers.getSetCookie()).toEqual([]);
      expect(await sessionDuJeton(base, jeton)).toBeDefined();
      expect((await lire(serveur, CHEMINS_COMPTES.moi, cookie)).status).toBe(200);
    },
    DELAI_DES_COMPTES_MS,
  );

  it.each([URL_PUBLIQUE_D_ESSAI, ORIGINE_AUTORISEE])(
    "F-009-AC16 le témoin : l'origine %s (URL_PUBLIQUE ou ORIGINES_AUTORISEES) est acceptée",
    async (origine) => {
      const serveur = await lancerServeur(base, {
        env: { ORIGINES_AUTORISEES: ORIGINE_AUTORISEE },
      });
      const corps = corpsUnique();

      const inscription = await poster(serveur, CHEMINS_COMPTES.inscription, corps, {
        Origin: origine,
      });
      const connexion = await connecter(serveur, corps, { Origin: origine });

      expect([inscription.status, connexion.status]).toEqual([200, 200]);
    },
    DELAI_DES_COMPTES_MS,
  );
});

describe("URL publique", () => {
  const TROMPEUR = {
    Host: "ailleurs.exemple.test",
    "X-Forwarded-Host": "ailleurs.exemple.test",
    "X-Forwarded-Proto": "https",
  };

  function inscriptionBrute(
    serveur: ServeurDEssai,
    corps: unknown,
    enTetes: Readonly<Record<string, string>>,
  ) {
    return envoyer(serveur, {
      methode: "POST",
      chemin: CHEMINS_COMPTES.inscription,
      corps: JSON.stringify(corps),
      enTetes: { "Content-Type": "application/json", ...enTetes },
    });
  }

  it(
    "F-009-AC30 des en-têtes Host et X-Forwarded-Proto qui diffèrent de URL_PUBLIQUE ne changent pas les attributs du cookie",
    async () => {
      const serveur = await lancerServeur(base);

      const temoin = await inscriptionBrute(serveur, corpsUnique(), {
        Origin: URL_PUBLIQUE_D_ESSAI,
      });
      const trompee = await inscriptionBrute(serveur, corpsUnique(), {
        Origin: URL_PUBLIQUE_D_ESSAI,
        ...TROMPEUR,
      });

      expect([temoin.statut, trompee.statut]).toEqual([200, 200]);
      expect(cookiePose(trompee.cookies).nom).toBe(NOM_DU_COOKIE);
      expect(cookiePose(trompee.cookies).attributs).toEqual(cookiePose(temoin.cookies).attributs);
      expect(cookiePose(trompee.cookies).attributs).not.toContain("Secure");
    },
    DELAI_DES_COMPTES_MS,
  );

  it(
    "F-009-AC30 F-009-AC16 une origine égale à l'hôte annoncé par la requête, mais pas à URL_PUBLIQUE, reste refusée",
    async () => {
      const serveur = await lancerServeur(base);
      const corps = corpsUnique();

      const reponse = await inscriptionBrute(serveur, corps, {
        Origin: "https://ailleurs.exemple.test",
        ...TROMPEUR,
      });

      expect(reponse.statut).toBe(403);
      expect(await comptesDe(base, corps.email)).toEqual([]);
    },
    DELAI_DES_COMPTES_MS,
  );
});

describe("liste fermée des routes d'authentification", () => {
  it.each<[string, string]>([
    ["POST", "/api/auth/change-password"],
    ["GET", "/api/auth/list-sessions"],
    ["POST", "/api/auth/get-session"],
    ["GET", "/api/auth"],
    ["GET", "/api/auth/"],
    ["GET", "/api/auth/ok"],
    ["POST", "/api/auth/update-user"],
    ["POST", "/api/auth/delete-user"],
    ["POST", "/api/auth/revoke-sessions"],
    ["POST", "/api/auth/sign-up/email/"],
    ["POST", "/api/auth/Sign-Up/email"],
    ["GET", CHEMINS_COMPTES.connexion],
    ["PUT", CHEMINS_COMPTES.deconnexion],
    ["DELETE", CHEMINS_COMPTES.session],
  ])(
    "F-009-AC17 %s %s reçoit 404 ressource-introuvable sans atteindre better-auth",
    async (methode, chemin) => {
      const serveur = await lancerServeur(base);
      const corps = corpsUnique();
      const { cookie, jeton, compte } = await inscrire(serveur, corps);
      const nouveau = corpsUnique();

      const reponse = await envoyer(serveur, {
        methode,
        chemin,
        corps:
          methode === "GET"
            ? undefined
            : JSON.stringify({
                ...nouveau,
                name: "Renommée",
                currentPassword: corps.password,
                newPassword: "nouveau-mot-de-passe",
              }),
        enTetes: {
          "Content-Type": "application/json",
          Origin: URL_PUBLIQUE_D_ESSAI,
          Cookie: cookie,
        },
      });

      expect(reponse.statut).toBe(404);
      expect((await enveloppeDe(new Response(reponse.texte))).code).toBe("ressource-introuvable");
      expect(await comptesDe(base, nouveau.email)).toEqual([]);
      expect((await comptesDe(base, corps.email)).map(({ name }) => name)).toEqual([corps.name]);
      expect(await sessionDuJeton(base, jeton)).toBeDefined();
      expect((await connecter(serveur, corps)).status).toBe(200);
      expect((await sessionsDe(base, compte.id)).length).toBe(2);
    },
    DELAI_DES_COMPTES_MS,
  );

  it(
    "F-009-AC17 HEAD sur une route GET ouverte reçoit aussi 404",
    async () => {
      const serveur = await lancerServeur(base);

      const reponse = await envoyer(serveur, { methode: "HEAD", chemin: CHEMINS_COMPTES.session });

      expect(reponse.statut).toBe(404);
    },
    DELAI_DES_COMPTES_MS,
  );
});

describe("taille du corps", () => {
  // Un corps d'inscription valide d'exactement `octets` octets : un champ hors contrat le remplit.
  function corpsDeTaille(octets: number): { texte: string; email: string } {
    const corps = corpsUnique();
    const vide = JSON.stringify({ ...corps, bourrage: "" });
    const texte = JSON.stringify({ ...corps, bourrage: "x".repeat(octets - vide.length) });
    expect(Buffer.byteLength(texte)).toBe(octets);
    return { texte, email: corps.email };
  }

  it.each<[string, string, string]>([
    ["POST", CHEMINS_COMPTES.inscription, "application/json"],
    ["POST", CHEMINS_COMPTES.connexion, "application/json"],
    ["POST", CHEMINS_COMPTES.deconnexion, "application/json"],
    ["POST", CHEMINS_COMPTES.inscription, "text/plain"],
    ["GET", CHEMINS_COMPTES.session, "application/json"],
  ])(
    "F-009-AC28 F-009-AC23 %s %s avec un corps %s de 100 001 octets reçoit 413 corps-trop-grand, sans atteindre better-auth",
    async (methode, chemin, type) => {
      const serveur = await lancerServeur(base);
      const { texte, email } = corpsDeTaille(LIMITE + 1);

      const statuts = [];
      for (let rang = 0; rang < 4; rang += 1) {
        const reponse = await envoyer(serveur, {
          methode,
          chemin,
          corps: texte,
          enTetes: { "Content-Type": type, Origin: URL_PUBLIQUE_D_ESSAI },
        });
        expect((await enveloppeDe(new Response(reponse.texte))).code).toBe("corps-trop-grand");
        statuts.push(reponse.statut);
      }

      expect(statuts).toEqual([413, 413, 413, 413]);
      expect(await comptesDe(base, email)).toEqual([]);
      expect((await poster(serveur, CHEMINS_COMPTES.inscription, corpsUnique())).status).toBe(200);
    },
    DELAI_DES_COMPTES_MS,
  );

  it(
    "F-009-AC28 le témoin : un corps d'inscription de 100 000 octets est lu et crée le compte",
    async () => {
      const serveur = await lancerServeur(base);
      const { texte, email } = corpsDeTaille(LIMITE);

      const reponse = await envoyer(serveur, {
        methode: "POST",
        chemin: CHEMINS_COMPTES.inscription,
        corps: texte,
        enTetes: { "Content-Type": "application/json", Origin: URL_PUBLIQUE_D_ESSAI },
      });

      expect(reponse.statut).toBe(200);
      expect(await comptesDe(base, email)).toHaveLength(1);
    },
    DELAI_DES_COMPTES_MS,
  );
});

describe("aucune ouverture entre origines", () => {
  const PRE_VERIFICATION = {
    Origin: ORIGINE_AUTORISEE,
    "Access-Control-Request-Method": "POST",
    "Access-Control-Request-Headers": "content-type",
  };

  it.each(
    [...Object.values(CHEMINS_COMPTES)].flatMap((chemin) => [
      [chemin, {}],
      [chemin, PRE_VERIFICATION],
    ]) as [string, Record<string, string>][],
  )(
    "F-009-AC32 OPTIONS %s (en-têtes %j) reçoit 404 ressource-introuvable, sans en-tête Access-Control-Allow-*",
    async (chemin, enTetes) => {
      const serveur = await lancerServeur(base, {
        env: { ORIGINES_AUTORISEES: ORIGINE_AUTORISEE },
      });

      const reponse = await envoyer(serveur, { methode: "OPTIONS", chemin, enTetes });

      expect(reponse.statut).toBe(404);
      expect((await enveloppeDe(new Response(reponse.texte))).code).toBe("ressource-introuvable");
      expect(enTetesDOuverture(reponse.enTetes)).toEqual([]);
    },
    DELAI_DES_COMPTES_MS,
  );

  it(
    "F-009-AC32 F-009-AC23 les réponses 200, 401, 403, 404, 413 et 429 de la feature, même pour une origine autorisée, ne portent aucun en-tête Access-Control-Allow-*, et portent les en-têtes de F-008",
    async () => {
      const serveur = await lancerServeur(base, {
        env: { ORIGINES_AUTORISEES: ORIGINE_AUTORISEE },
      });
      const avecOrigine = { Origin: ORIGINE_AUTORISEE };
      const corps = corpsUnique();

      const reponses = [
        await poster(serveur, CHEMINS_COMPTES.inscription, corps, avecOrigine),
        await lire(serveur, CHEMINS_COMPTES.session, undefined, avecOrigine),
        await lire(serveur, CHEMINS_COMPTES.moi, undefined, avecOrigine),
        await connecter(serveur, { ...corps, password: "mot-de-passe-faux" }, avecOrigine),
        await poster(serveur, CHEMINS_COMPTES.inscription, corpsUnique(), {
          Origin: ORIGINE_ETRANGERE,
        }),
        await lire(serveur, "/api/auth/list-sessions", undefined, avecOrigine),
        await poster(
          serveur,
          CHEMINS_COMPTES.inscription,
          { bourrage: "x".repeat(LIMITE) },
          avecOrigine,
        ),
      ];
      // Le refus d'origine a compté pour le plafond des inscriptions : la quatrième passe au-delà.
      for (let rang = 0; rang < 2; rang += 1) {
        reponses.push(
          await poster(serveur, CHEMINS_COMPTES.inscription, corpsUnique(), avecOrigine),
        );
      }

      expect(reponses.map(({ status }) => status)).toEqual([
        200, 200, 401, 401, 403, 404, 413, 200, 429,
      ]);
      for (const reponse of reponses) {
        expect(enTetesDOuverture(reponse.headers)).toEqual([]);
        expect(reponse.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
        expect(reponse.headers.get("x-content-type-options")).toBe("nosniff");
        expect(reponse.headers.get("referrer-policy")).toBe("no-referrer");
        expect(reponse.headers.get("content-security-policy")).toContain("default-src 'none'");
        expect(reponse.headers.has("x-powered-by")).toBe(false);
      }
      expect(poseUnCookieDeSession(reponses[0] ?? new Response())).toBe(true);
    },
    DELAI_DES_COMPTES_MS,
  );

  it(
    "F-009-AC23 GET /sante et GET /pret répondent sans session, comme sous F-008",
    async () => {
      const serveur = await lancerServeur(base);

      const sante = await lire(serveur, CHEMINS.sante);
      const pret = await lire(serveur, CHEMINS.pret);

      expect([sante.status, pret.status]).toEqual([200, 200]);
      expect(await sante.json()).toEqual({ etat: "ok" });
      expect(await pret.json()).toEqual({ etat: "pret" });
    },
    DELAI_DES_COMPTES_MS,
  );
});
