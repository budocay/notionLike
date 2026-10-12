// Les comptes dans le processus réel, lancé par l'entrée d'essai `essai/main-base-embarquee.ts`
// (le service de production sur une base embarquée) : la limitation de débit quelle que soit
// `NODE_ENV`, que better-auth lit lui-même dans l'environnement du processus (F-009-AC27), et toute
// la sortie du processus quand la base échoue (F-009-AC19).
import { CHEMINS_COMPTES, schemaEnveloppeErreur } from "@notionlike/contrats";
import { afterEach, describe, expect, it } from "vitest";

import { ENV_D_ESSAI, URL_PUBLIQUE_D_ESSAI } from "./aides.ts";
import { arreterLesProcessus, lancer, urlDEcoute } from "./aides-processus.ts";

const ENTREE = "apps/server/test/essai/main-base-embarquee.ts";
const DELAI_MS = 60_000;
// La base embarquée s'ouvre et se migre avant l'écoute : plus long que `src/main.ts`.
const DELAI_DE_DEMARRAGE_MS = 30_000;
const TEXTE_SQL = /\b(select|insert into|update|delete from)\b|"user"|"session"|"account"|params:/i;

afterEach(arreterLesProcessus);

function posterA(url: string, chemin: string, corps: unknown): Promise<Response> {
  return fetch(`${url}${chemin}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: URL_PUBLIQUE_D_ESSAI },
    body: JSON.stringify(corps),
  });
}

function corpsDe(email: string, password = "mot-de-passe-d-essai-long") {
  return { name: "Ada Lovelace", email, password };
}

describe("limitation de débit dans le processus", () => {
  it.each(["production", "development", "test", undefined])(
    "F-009-AC27 F-009-AC14 F-009-AC31 avec NODE_ENV=%s, la 6e connexion, la 4e inscription et la 61e requête reçoivent 429",
    async (mode) => {
      const processus = lancer(
        { ...ENV_D_ESSAI, PORT: "0", ...(mode === undefined ? {} : { NODE_ENV: mode }) },
        ENTREE,
      );
      const url = await urlDEcoute(processus, DELAI_DE_DEMARRAGE_MS);

      const connexions = [];
      for (let rang = 0; rang < 6; rang += 1) {
        connexions.push(
          await posterA(url, CHEMINS_COMPTES.connexion, corpsDe("inconnu@exemple.test")),
        );
      }
      const inscriptions = [];
      for (let rang = 0; rang < 4; rang += 1) {
        inscriptions.push(
          await posterA(
            url,
            CHEMINS_COMPTES.inscription,
            corpsDe(`ada-${String(rang)}@exemple.test`),
          ),
        );
      }
      const lectures = [];
      for (let rang = 0; rang < 51; rang += 1) {
        lectures.push(await fetch(`${url}${CHEMINS_COMPTES.session}`));
      }
      const derniere = lectures.at(-1) ?? new Response();

      expect(connexions.map(({ status }) => status)).toEqual([401, 401, 401, 401, 401, 429]);
      expect(connexions.at(-1)?.headers.get("Retry-After")).toMatch(/^([1-9]|[1-5]\d|60)$/);
      expect(inscriptions.map(({ status }) => status)).toEqual([200, 200, 200, 429]);
      expect(inscriptions.at(-1)?.headers.get("Retry-After")).toMatch(/^([1-9]|[1-5]\d|60)$/);
      expect(lectures.slice(0, -1).every(({ status }) => status === 200)).toBe(true);
      expect(derniere.status).toBe(429);
      expect(schemaEnveloppeErreur.parse(await derniere.json()).code).toBe("trop-de-requetes");
      expect(derniere.headers.get("Retry-After")).toMatch(/^([1-9]|[1-5]\d|60)$/);
    },
    DELAI_MS,
  );
});

describe("base défaillante dans le processus", () => {
  it(
    "F-009-AC19 F-009-AC20 quand l'écriture d'un compte, d'un identifiant ou d'une session échoue, toute la sortie du processus ne porte ni courriel, ni mot de passe, ni empreinte, ni jeton, ni texte de requête",
    async () => {
      const processus = lancer({ ...ENV_D_ESSAI, PORT: "0", ESSAI_BASE_DEFAILLANTE: "1" }, ENTREE);
      const url = await urlDEcoute(processus, DELAI_DE_DEMARRAGE_MS);
      const corps = {
        compte: corpsDe("ada@compte-refuse.test", "mot-de-passe-du-compte"),
        identifiant: corpsDe("ada@identifiant-refuse.test", "mot-de-passe-de-l-identifiant"),
        session: corpsDe("ada@session-refusee.test", "mot-de-passe-de-la-session"),
      };

      const ouverte = await posterA(url, CHEMINS_COMPTES.inscription, corps.session);
      const { token } = (await ouverte.json()) as { token: string };
      const statuts = [
        (await posterA(url, CHEMINS_COMPTES.inscription, corps.compte)).status,
        (await posterA(url, CHEMINS_COMPTES.inscription, corps.identifiant)).status,
        (await posterA(url, CHEMINS_COMPTES.connexion, corps.session)).status,
      ];
      processus.enfant.kill("SIGTERM");
      await processus.fin;
      const sortie = `${processus.sortieStandard()}\n${processus.sortieDErreur()}`;
      const echecs = processus.lignesDuJournal().filter(({ message }) => message === "echec");

      expect(ouverte.status).toBe(200);
      expect(statuts).toEqual([500, 500, 500]);
      expect(echecs.map(({ code, classe }) => ({ code, classe }))).toEqual([
        { code: "authentification-en-echec", classe: "DrizzleQueryError" },
        { code: "authentification-en-echec", classe: "DrizzleQueryError" },
        { code: "authentification-en-echec", classe: "DrizzleQueryError" },
      ]);
      expect(processus.sortieDErreur()).toBe("");
      for (const secret of [
        ...Object.values(corps).flatMap(({ email, password }) => [email, password]),
        token,
        "argon2id",
        "écriture refusée",
      ]) {
        expect(sortie).not.toContain(secret);
      }
      expect(sortie).not.toMatch(TEXTE_SQL);
      expect(sortie.replaceAll(/[0-9a-f-]{36}/g, "")).not.toMatch(/[A-Za-z0-9]{32}/);
    },
    DELAI_MS,
  );
});
