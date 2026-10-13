// Limitation de débit des routes d'authentification et adresse de la requête (F-009-AC14, AC15,
// AC27, AC31). L'horloge est celle de `Date`, injectée par Vitest : aucun test n'attend (H12).
// Chaque test lance son serveur, donc ses compteurs ; la limitation n'a aucun réglage propre aux
// tests (F-009-AC27).
import crypto from "node:crypto";
import { Agent } from "node:http";

import { CHEMINS_COMPTES, schemaEnveloppeErreur } from "@notionlike/contrats";
import type { Base } from "@notionlike/db";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import {
  arreterLesServeurs,
  enveloppeDe,
  lancerServeur,
  URL_PUBLIQUE_D_ESSAI,
  type ServeurDEssai,
  DELAI_D_OUVERTURE_D_UNE_BASE_MS,
} from "./aides.ts";
import {
  DELAI_DES_COMPTES_MS,
  comptesDe,
  connecter,
  corpsUnique,
  courrielUnique,
  deconnecter,
  envoyer,
  fermerLesBases,
  inscrire,
  lire,
  ouvrirUneBase,
  poster,
  sessionDuJeton,
  type ReponseBrute,
} from "./aides-comptes.ts";

const PLAFOND_DES_CONNEXIONS = 5;
const PLAFOND_DES_INSCRIPTIONS = 3;
const PLAFOND_GLOBAL = 60;

let base: Base;
const agents: Agent[] = [];

beforeAll(async () => {
  base = await ouvrirUneBase();
}, DELAI_D_OUVERTURE_D_UNE_BASE_MS);
afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  agents.splice(0).forEach((agent) => {
    agent.destroy();
  });
  await arreterLesServeurs();
});
afterAll(fermerLesBases);

function horlogeFixe(): number {
  const debut = Date.now();
  vi.useFakeTimers({ toFake: ["Date"], now: debut });
  return debut;
}

// Une seule connexion TCP, réutilisée par toutes les requêtes qui la reçoivent.
function uneConnexion(): Agent {
  const agent = new Agent({ keepAlive: true, maxSockets: 1 });
  agents.push(agent);
  return agent;
}

function attenteDe(enTete: string | null | undefined): number {
  expect(enTete).toMatch(/^\d+$/);
  return Number(enTete);
}

// Une connexion JSON posée par la connexion TCP donnée, avec un `X-Forwarded-For` au choix.
function connexionBrute(
  serveur: ServeurDEssai,
  agent: Agent,
  corps: unknown,
  adresseAnnoncee?: string,
): Promise<ReponseBrute> {
  return envoyer(serveur, {
    methode: "POST",
    chemin: CHEMINS_COMPTES.connexion,
    agent,
    corps: JSON.stringify(corps),
    enTetes: {
      "Content-Type": "application/json",
      Origin: URL_PUBLIQUE_D_ESSAI,
      ...(adresseAnnoncee === undefined ? {} : { "X-Forwarded-For": adresseAnnoncee }),
    },
  });
}

describe("plafonds de connexion et d'inscription", () => {
  it(
    "F-009-AC14 F-009-AC27 au-delà de 5 connexions en 60 secondes, sous NODE_ENV=test : 429 avec Retry-After de 1 à 60, sans vérifier le mot de passe, jusqu'à la fin de la fenêtre ; les réussites comptent",
    async () => {
      expect(process.env.NODE_ENV).toBe("test");
      const debut = horlogeFixe();
      const serveur = await lancerServeur(base);
      const corps = corpsUnique();
      await inscrire(serveur, corps);
      const faux = { email: corps.email, password: "un-autre-mot-de-passe" };

      const statuts = [];
      for (const essai of [corps, faux, corps, faux, faux]) {
        statuts.push((await connecter(serveur, essai)).status);
      }
      const calculs = vi.spyOn(crypto, "argon2");
      vi.setSystemTime(debut + 30_000);
      const enExces = await connecter(serveur, corps);
      vi.setSystemTime(debut + 59_000);
      const finDeFenetre = await connecter(serveur, corps);
      const verificationsEnExces = calculs.mock.calls.length;
      vi.setSystemTime(debut + 60_001);
      const fenetreSuivante = await connecter(serveur, corps);

      expect(statuts).toEqual([200, 401, 200, 401, 401]);
      expect(enExces.status).toBe(429);
      expect(attenteDe(enExces.headers.get("Retry-After"))).toBe(30);
      expect(await enExces.json()).toEqual({
        message: "Too many requests. Please try again later.",
      });
      expect(finDeFenetre.status).toBe(429);
      expect(attenteDe(finDeFenetre.headers.get("Retry-After"))).toBe(1);
      expect(verificationsEnExces).toBe(0);
      expect(fenetreSuivante.status).toBe(200);
    },
    DELAI_DES_COMPTES_MS,
  );

  it(
    "F-009-AC14 F-009-AC27 au-delà de 3 inscriptions en 60 secondes : 429 avec Retry-After, sans créer de compte",
    async () => {
      const debut = horlogeFixe();
      const serveur = await lancerServeur(base);
      const corpsEnExces = corpsUnique("en-exces");

      const statuts = [];
      for (let rang = 0; rang < PLAFOND_DES_INSCRIPTIONS; rang += 1) {
        statuts.push((await poster(serveur, CHEMINS_COMPTES.inscription, corpsUnique())).status);
      }
      vi.setSystemTime(debut + 1000);
      const enExces = await poster(serveur, CHEMINS_COMPTES.inscription, corpsEnExces);
      vi.setSystemTime(debut + 61_000);
      const apres = await poster(serveur, CHEMINS_COMPTES.inscription, corpsUnique());

      expect(statuts).toEqual([200, 200, 200]);
      expect(enExces.status).toBe(429);
      expect(attenteDe(enExces.headers.get("Retry-After"))).toBe(59);
      expect(await comptesDe(base, corpsEnExces.email)).toEqual([]);
      expect(apres.status).toBe(200);
    },
    DELAI_DES_COMPTES_MS,
  );

  it(
    "F-009-AC14 le témoin : 5 connexions et 3 inscriptions passent toutes",
    async () => {
      horlogeFixe();
      const serveur = await lancerServeur(base);
      const corps = corpsUnique();

      const inscriptions = [];
      for (let rang = 0; rang < PLAFOND_DES_INSCRIPTIONS; rang += 1) {
        inscriptions.push(
          (await poster(serveur, CHEMINS_COMPTES.inscription, rang === 0 ? corps : corpsUnique()))
            .status,
        );
      }
      const connexions = [];
      for (let rang = 0; rang < PLAFOND_DES_CONNEXIONS; rang += 1) {
        connexions.push((await connecter(serveur, corps)).status);
      }

      expect(inscriptions).toEqual([200, 200, 200]);
      expect(connexions).toEqual([200, 200, 200, 200, 200]);
    },
    DELAI_DES_COMPTES_MS,
  );
});

describe("plafond global des routes d'authentification", () => {
  it(
    "F-009-AC31 F-009-AC27 F-009-AC22 au-delà de 60 requêtes sous /api/auth/, réparties sur plusieurs routes sans dépasser le plafond d'aucune : 429 trop-de-requetes, Retry-After, sans transmettre à better-auth",
    async () => {
      const debut = horlogeFixe();
      const serveur = await lancerServeur(base);
      const corps = corpsUnique();
      const { cookie, jeton } = await inscrire(serveur, corps);
      const envois: (() => Promise<Response>)[] = [
        ...Array.from({ length: 4 }, () => () => connecter(serveur, corps)),
        ...Array.from(
          { length: 2 },
          () => () => poster(serveur, CHEMINS_COMPTES.inscription, corpsUnique()),
        ),
        ...Array.from({ length: 25 }, () => () => lire(serveur, CHEMINS_COMPTES.session)),
        ...Array.from({ length: 24 }, () => () => deconnecter(serveur)),
        ...Array.from({ length: 3 }, () => () => lire(serveur, "/api/auth/list-sessions")),
        ...Array.from({ length: 1 }, () => () => poster(serveur, CHEMINS_COMPTES.inscription, {})),
      ];

      const statuts = new Set<number>();
      for (const envoi of envois) {
        statuts.add((await envoi()).status);
      }
      vi.setSystemTime(debut + 20_000);
      const enExces = await deconnecter(serveur, cookie);
      const enveloppe = schemaEnveloppeErreur.parse(await enExces.clone().json());
      const inscriptionEnExces = corpsUnique("en-exces");
      const autre = await poster(serveur, CHEMINS_COMPTES.inscription, inscriptionEnExces);
      vi.setSystemTime(debut + 60_001);
      const fenetreSuivante = await lire(serveur, CHEMINS_COMPTES.moi, cookie);

      expect(envois.length + 1).toBe(PLAFOND_GLOBAL);
      expect([...statuts].sort()).toEqual([200, 400, 404]);
      expect(enExces.status).toBe(429);
      expect(enveloppe.code).toBe("trop-de-requetes");
      expect(attenteDe(enExces.headers.get("Retry-After"))).toBe(40);
      expect(await sessionDuJeton(base, jeton)).toBeDefined();
      expect(autre.status).toBe(429);
      expect((await enveloppeDe(autre)).code).toBe("trop-de-requetes");
      expect(await comptesDe(base, inscriptionEnExces.email)).toEqual([]);
      expect(fenetreSuivante.status).toBe(200);
    },
    DELAI_DES_COMPTES_MS * 2,
  );

  it(
    "F-009-AC31 les requêtes hors de /api/auth/ ne comptent pas",
    async () => {
      horlogeFixe();
      const serveur = await lancerServeur(base);
      for (let rang = 0; rang < PLAFOND_GLOBAL + 5; rang += 1) {
        await lire(serveur, CHEMINS_COMPTES.moi);
      }

      expect((await lire(serveur, CHEMINS_COMPTES.session)).status).toBe(200);
    },
    DELAI_DES_COMPTES_MS,
  );
});

describe("adresse de la requête", () => {
  it(
    "F-009-AC15 F-009-AC14 par défaut, des X-Forwarded-For différents sur la même connexion sont comptés ensemble",
    async () => {
      horlogeFixe();
      const serveur = await lancerServeur(base);
      const agent = uneConnexion();
      const corps = { email: courrielUnique("inconnu"), password: "mot-de-passe-faux" };

      const statuts = [];
      for (let rang = 1; rang <= PLAFOND_DES_CONNEXIONS + 1; rang += 1) {
        statuts.push(
          (await connexionBrute(serveur, agent, corps, `203.0.113.${String(rang)}`)).statut,
        );
      }

      expect(statuts).toEqual([401, 401, 401, 401, 401, 429]);
    },
    DELAI_DES_COMPTES_MS,
  );

  it(
    "F-009-AC15 F-009-AC31 par défaut, des X-Forwarded-For différents comptent ensemble au plafond global",
    async () => {
      horlogeFixe();
      const serveur = await lancerServeur(base);
      const agent = uneConnexion();

      const statuts = [];
      for (let rang = 1; rang <= PLAFOND_GLOBAL + 1; rang += 1) {
        const reponse = await envoyer(serveur, {
          methode: "GET",
          chemin: CHEMINS_COMPTES.session,
          agent,
          enTetes: { "X-Forwarded-For": `198.51.100.${String(rang)}` },
        });
        statuts.push(reponse.statut);
      }

      expect(statuts.slice(0, PLAFOND_GLOBAL).every((statut) => statut === 200)).toBe(true);
      expect(statuts.at(-1)).toBe(429);
    },
    DELAI_DES_COMPTES_MS,
  );

  it(
    "F-009-AC15 F-009-AC19 par défaut, la session et le journal portent l'adresse de la connexion, jamais celle que le client annonce",
    async () => {
      const serveur = await lancerServeur(base);
      const corps = corpsUnique();
      await inscrire(serveur, corps);

      const reponse = await connexionBrute(serveur, uneConnexion(), corps, "203.0.113.7");
      const { token } = JSON.parse(reponse.texte) as { token: string };
      const evenement = serveur.lignesDuJournal().find(({ type }) => type === "connexion");

      expect(reponse.statut).toBe(200);
      expect((await sessionDuJeton(base, token))?.ipAddress).toBe("127.0.0.1");
      expect(evenement?.adresse).toBe("127.0.0.1");
      expect(serveur.texteDuJournal()).not.toContain("203.0.113.7");
    },
    DELAI_DES_COMPTES_MS,
  );

  it(
    "F-009-AC15 avec PROXYS_DE_CONFIANCE=1, l'adresse retenue est celle que le proxy a écrite dans X-Forwarded-For, en session, au journal et dans les compteurs",
    async () => {
      horlogeFixe();
      const serveur = await lancerServeur(base, { env: { PROXYS_DE_CONFIANCE: "1" } });
      const corps = corpsUnique();
      await inscrire(serveur, corps);
      const agent = uneConnexion();

      const reponse = await connexionBrute(serveur, agent, corps, "192.0.2.1, 203.0.113.7");
      const { token } = JSON.parse(reponse.texte) as { token: string };
      const evenement = serveur.lignesDuJournal().find(({ type }) => type === "connexion");
      const statuts = [];
      for (let rang = 1; rang <= PLAFOND_DES_CONNEXIONS + 1; rang += 1) {
        const faux = { email: corps.email, password: "mot-de-passe-faux" };
        statuts.push(
          (await connexionBrute(serveur, agent, faux, `203.0.113.${String(rang + 10)}`)).statut,
        );
      }

      expect((await sessionDuJeton(base, token))?.ipAddress).toBe("203.0.113.7");
      expect(evenement?.adresse).toBe("203.0.113.7");
      expect(statuts).toEqual([401, 401, 401, 401, 401, 401]);
    },
    DELAI_DES_COMPTES_MS,
  );
});
