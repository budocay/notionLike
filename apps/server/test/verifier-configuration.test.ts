// L'entrée de vérification de la configuration (ADR-0017, F-031 H6), par un vrai processus :
// `node apps/server/src/verifier-configuration.ts` lancé depuis la racine du dépôt comme dans
// l'image, son contrat de sortie, et ce qu'elle importe.
import { readFileSync } from "node:fs";
import { createServer, type AddressInfo, type Server } from "node:net";
import { parseEnv } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import {
  ErreurConfiguration,
  lireConfiguration,
  RAISONS,
  texteDuRefusDeConfiguration,
  type Environnement,
} from "../src/configuration.ts";
import { importationsAtteignables } from "./aides-sources.ts";
import { arreterLesProcessus, DELAI_DES_TESTS_DE_PROCESSUS_MS, lancer } from "./aides-processus.ts";
import {
  ENV_D_ESSAI,
  ENV_DES_COMPTES_D_ESSAI,
  occuperUnPort,
  SECRET_D_ESSAI,
  URL_BASE_D_ESSAI,
  URL_PUBLIQUE_D_ESSAI,
  type PortOccupe,
} from "./aides.ts";

const ENTREE = "apps/server/src/verifier-configuration.ts";
const SRC = new URL("../src/", import.meta.url);
const EXEMPLE = readFileSync(new URL("../.env.example", import.meta.url), "utf8");
const MARQUEUR = "marque-qqzzkkww";

const portsOccupes: PortOccupe[] = [];
const ecoutes: Server[] = [];

// Une fausse base qui ne fait que compter les connexions reçues.
async function baseQuiCompte(): Promise<{ url: string; connexions: () => number }> {
  let connexions = 0;
  const serveur = createServer((socket) => {
    connexions += 1;
    socket.destroy();
  });
  ecoutes.push(serveur);
  await new Promise<void>((resolve) => serveur.listen(0, "127.0.0.1", resolve));
  const { port } = serveur.address() as AddressInfo;
  return {
    url: `postgres://essai:mot-de-passe-d-essai@127.0.0.1:${String(port)}/essai`,
    connexions: () => connexions,
  };
}

afterEach(async () => {
  await arreterLesProcessus();
  await Promise.all(portsOccupes.splice(0).map((occupe) => occupe.liberer()));
  await Promise.all(
    ecoutes.splice(0).map((serveur) => new Promise((resolve) => serveur.close(resolve))),
  );
});

describe("configuration acceptée", () => {
  it(
    "F-031-AC8 code 0, et sur la sortie standard exactement deux lignes : URL_PUBLIQUE puis ORIGINES_AUTORISEES ; rien sur la sortie d'erreur",
    async () => {
      const processus = lancer(
        {
          ...ENV_D_ESSAI,
          ORIGINES_AUTORISEES: "http://127.0.0.1:5173,http://127.0.0.1:5174",
        },
        ENTREE,
      );

      expect(await processus.fin).toEqual({ code: 0, signal: null });
      expect(processus.sortieStandard()).toBe(
        `URL_PUBLIQUE=${URL_PUBLIQUE_D_ESSAI}\nORIGINES_AUTORISEES=http://127.0.0.1:5173,http://127.0.0.1:5174\n`,
      );
      expect(processus.sortieDErreur()).toBe("");
    },
    DELAI_DES_TESTS_DE_PROCESSUS_MS,
  );

  it(
    "F-031-AC8 sans origine autorisée, la seconde ligne est vide après le signe égal ; aucun secret n'est écrit",
    async () => {
      const processus = lancer({ ...ENV_D_ESSAI, NODE_ENV: "production" }, ENTREE);

      expect(await processus.fin).toEqual({ code: 0, signal: null });
      expect(processus.sortieStandard()).toBe(
        `URL_PUBLIQUE=${URL_PUBLIQUE_D_ESSAI}\nORIGINES_AUTORISEES=\n`,
      );
      expect(processus.sortieStandard()).not.toContain(SECRET_D_ESSAI);
      expect(processus.sortieStandard()).not.toContain(URL_BASE_D_ESSAI);
    },
    DELAI_DES_TESTS_DE_PROCESSUS_MS,
  );

  it(
    "F-031-AC8 la vérification n'écoute sur aucun port et n'ouvre aucune connexion : le port configuré déjà pris, la base configurée jamais appelée",
    async () => {
      const occupe = await occuperUnPort();
      portsOccupes.push(occupe);
      const base = await baseQuiCompte();

      const processus = lancer(
        { ...ENV_D_ESSAI, PORT: String(occupe.port), URL_BASE_DONNEES: base.url },
        ENTREE,
      );

      expect(await processus.fin).toEqual({ code: 0, signal: null });
      expect(processus.sortieDErreur()).toBe("");
      expect(base.connexions()).toBe(0);
    },
    DELAI_DES_TESTS_DE_PROCESSUS_MS,
  );

  it(
    "F-031-AC8 F-031-AC29 le fichier d'exemple, ses deux secrets factices remplacés, est accepté en production et donne les origines du client",
    async () => {
      const variables = parseEnv(EXEMPLE);
      const processus = lancer(
        {
          ...variables,
          NODE_ENV: "production",
          URL_BASE_DONNEES: URL_BASE_D_ESSAI,
          BETTER_AUTH_SECRET: SECRET_D_ESSAI,
        },
        ENTREE,
      );

      expect(await processus.fin).toEqual({ code: 0, signal: null });
      expect(processus.sortieStandard()).toBe(
        "URL_PUBLIQUE=http://127.0.0.1:5173\nORIGINES_AUTORISEES=http://127.0.0.1:5173,http://127.0.0.1:5174\n",
      );
    },
    DELAI_DES_TESTS_DE_PROCESSUS_MS,
  );
});

describe("configuration refusée", () => {
  it(
    "F-031-AC8 F-031-AC12 code 1, le texte entier du refus sur la sortie d'erreur, rien sur la sortie standard",
    async () => {
      const env = { ...ENV_DES_COMPTES_D_ESSAI, PORT: "70000" };
      const processus = lancer(env, ENTREE);

      expect(await processus.fin).toEqual({ code: 1, signal: null });
      expect(processus.sortieDErreur()).toBe(
        [
          "Configuration invalide : PORT, URL_BASE_DONNEES",
          `- PORT : ${RAISONS.horsBornes}`,
          `- URL_BASE_DONNEES : ${RAISONS.absente}`,
          "",
        ].join("\n"),
      );
      expect(processus.sortieStandard()).toBe("");
    },
    DELAI_DES_TESTS_DE_PROCESSUS_MS,
  );

  it(
    "F-031-AC8 F-031-AC12 F-008-AC14 F-009-AC18 le fichier d'exemple copié tel quel est refusé en production par ses deux secrets factices, le même texte que main.ts",
    async () => {
      const env = { ...parseEnv(EXEMPLE), NODE_ENV: "production" };
      const verification = lancer(env, ENTREE);
      const demarrage = lancer({ ...env, PORT: "0" });

      expect(await verification.fin).toEqual({ code: 1, signal: null });
      expect(await demarrage.fin).toEqual({ code: 1, signal: null });
      expect(verification.sortieDErreur()).toBe(
        [
          "Configuration invalide : URL_BASE_DONNEES, BETTER_AUTH_SECRET",
          `- URL_BASE_DONNEES : ${RAISONS.factice}`,
          `- BETTER_AUTH_SECRET : ${RAISONS.factice}`,
          "",
        ].join("\n"),
      );
      expect(demarrage.sortieDErreur()).toBe(verification.sortieDErreur());
      expect(verification.sortieStandard()).toBe("");
    },
    DELAI_DES_TESTS_DE_PROCESSUS_MS,
  );

  it(
    "F-031-AC13 ni une valeur marquée ni un de ses segments de quatre caractères sur l'une ou l'autre sortie",
    async () => {
      const env = {
        ...ENV_D_ESSAI,
        NODE_ENV: MARQUEUR,
        URL_BASE_DONNEES: `qzkwj://${MARQUEUR}@kq7zp.zz9/zq`,
        BETTER_AUTH_SECRET: MARQUEUR,
      };
      const processus = lancer(env, ENTREE);

      expect(await processus.fin).toEqual({ code: 1, signal: null });
      const sorties = processus.sortieDErreur() + processus.sortieStandard();
      expect(sorties).toBe(texteDuRefusDeConfiguration(refusDe(env)));
      for (let debut = 0; debut + 4 <= MARQUEUR.length; debut += 1) {
        expect(sorties).not.toContain(MARQUEUR.slice(debut, debut + 4));
      }
      expect(sorties).not.toContain("qzkwj");
    },
    DELAI_DES_TESTS_DE_PROCESSUS_MS,
  );
});

function refusDe(env: Environnement): ErreurConfiguration {
  try {
    lireConfiguration(env);
  } catch (erreur) {
    if (erreur instanceof ErreurConfiguration) {
      return erreur;
    }
    throw erreur;
  }
  throw new Error("la configuration a été acceptée");
}

describe("importations de l'entrée de vérification", () => {
  it("F-031-AC8 ADR-0017 depuis l'entrée de vérification, seuls configuration.ts et zod sont atteignables : ni base, ni réseau, ni module de Node", () => {
    const { fichiers, paquets } = importationsAtteignables(
      new URL("verifier-configuration.ts", SRC),
    );

    expect(fichiers.sort()).toEqual(["src/configuration.ts", "src/verifier-configuration.ts"]);
    expect(paquets).toEqual(["zod"]);
  });
});
