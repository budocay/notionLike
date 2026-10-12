// Le processus réel : `node apps/server/src/main.ts`, lancé depuis la racine du dépôt comme dans
// l'image, sans Vitest entre les deux. Node y charge les trois paquets par leurs sources (ADR-0006).
import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

import { CHEMINS } from "@notionlike/contrats";
import { demarrerFauxPostgres, portFerme, type FauxPostgres } from "@notionlike/db/essai";
import { afterEach, describe, expect, it } from "vitest";

import {
  lireConfiguration,
  MOT_DE_PASSE_FACTICE,
  type Environnement,
} from "../src/configuration.ts";
import {
  enveloppeDe,
  type LigneDeJournal,
  MOT_DE_PASSE_D_ESSAI,
  occuperUnPort,
  type PortOccupe,
  pretDe,
  santeDe,
  URL_BASE_D_ESSAI,
} from "./aides.ts";

const RACINE = fileURLToPath(new URL("../../../", import.meta.url));
const EXEMPLE = readFileSync(new URL("../.env.example", import.meta.url), "utf8");
const ENTREE = "apps/server/src/main.ts";
const ENTREE_DONT_LA_BASE_NE_SE_FERME_PAS = "apps/server/test/essai/main-fermeture-en-echec.ts";
const DELAI_DES_TESTS_DE_PROCESSUS_MS = 20_000;
const MARQUEUR = "valeur-fautive-a-ne-pas-afficher";

interface FinDuProcessus {
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
}

interface Processus {
  readonly enfant: ChildProcess;
  readonly fin: Promise<FinDuProcessus>;
  sortieStandard(): string;
  sortieDErreur(): string;
  lignesDuJournal(): LigneDeJournal[];
}

const lances: Processus[] = [];
const fauxServeurs: FauxPostgres[] = [];
const portsOccupes: PortOccupe[] = [];

// L'environnement de l'enfant est exactement celui du test : rien n'est hérité de Vitest.
function lancer(env: Environnement, entree = ENTREE): Processus {
  const enfant = spawn(process.execPath, [entree], { cwd: RACINE, env });
  const sorties = { standard: "", erreur: "" };
  enfant.stdout.on("data", (morceau: Buffer) => (sorties.standard += morceau.toString("utf8")));
  enfant.stderr.on("data", (morceau: Buffer) => (sorties.erreur += morceau.toString("utf8")));
  const processus: Processus = {
    enfant,
    fin: new Promise((resolve) => {
      enfant.on("close", (code, signal) => {
        resolve({ code, signal });
      });
    }),
    sortieStandard: () => sorties.standard,
    sortieDErreur: () => sorties.erreur,
    lignesDuJournal: () =>
      sorties.standard
        .split("\n")
        .filter((ligne) => ligne !== "")
        .map((ligne) => JSON.parse(ligne) as LigneDeJournal),
  };
  lances.push(processus);
  return processus;
}

interface ProcessusServi {
  readonly processus: Processus;
  readonly url: string;
  readonly faux: FauxPostgres;
}

// `neFermeJamais` : une base figée, qui garde son côté des connexions ouvert après l'adieu du pilote.
async function lancerSurFauxPostgres(options?: {
  readonly neFermeJamais: boolean;
}): Promise<ProcessusServi> {
  const faux = await demarrerFauxPostgres(MOT_DE_PASSE_D_ESSAI, options);
  fauxServeurs.push(faux);
  const processus = lancer({ PORT: "0", URL_BASE_DONNEES: faux.url });
  return { processus, url: await urlDEcoute(processus), faux };
}

// Attend la ligne `ecoute` du journal et rend l'adresse où le processus sert.
async function urlDEcoute(processus: Processus): Promise<string> {
  const ligne = await expect
    .poll(() => processus.lignesDuJournal().find(({ message }) => message === "ecoute"), {
      timeout: 10_000,
    })
    .toBeDefined()
    .then(() => processus.lignesDuJournal().find(({ message }) => message === "ecoute"));
  return `http://${String(ligne?.hote)}:${String(ligne?.port)}`;
}

function variablesDe(texte: string): Environnement {
  return parseEnv(texte);
}

afterEach(async () => {
  for (const { enfant, fin } of lances.splice(0)) {
    enfant.kill("SIGKILL");
    await fin;
  }
  await Promise.all(fauxServeurs.splice(0).map((faux) => faux.arreter()));
  await Promise.all(portsOccupes.splice(0).map((occupe) => occupe.liberer()));
});

describe("refus de démarrer", () => {
  it(
    "F-008-AC12 sans URL_BASE_DONNEES, le processus finit en code 1 en nommant la variable, sans rien écouter",
    async () => {
      const processus = lancer({ PORT: "0" });

      expect(await processus.fin).toEqual({ code: 1, signal: null });
      expect(processus.sortieDErreur()).toBe("Configuration invalide : URL_BASE_DONNEES\n");
      expect(processus.sortieStandard()).toBe("");
    },
    DELAI_DES_TESTS_DE_PROCESSUS_MS,
  );

  it(
    "F-008-AC12 chaque variable invalide est nommée sur la sortie d'erreur, sans sa valeur",
    async () => {
      const processus = lancer({
        PORT: MARQUEUR,
        URL_BASE_DONNEES: `postgres://essai:${MARQUEUR}@127.0.0.1:5432/essai`,
        ORIGINES_AUTORISEES: `https://${MARQUEUR}.test/chemin`,
      });

      expect(await processus.fin).toEqual({ code: 1, signal: null });
      expect(processus.sortieDErreur()).toBe(
        "Configuration invalide : PORT, ORIGINES_AUTORISEES\n",
      );
      expect(processus.sortieStandard()).toBe("");
    },
    DELAI_DES_TESTS_DE_PROCESSUS_MS,
  );

  it(
    "F-008-AC14 en production, comme dans l'image, le fichier d'exemple copié tel quel fait refuser le démarrage",
    async () => {
      const processus = lancer({ NODE_ENV: "production", ...variablesDe(EXEMPLE), PORT: "0" });

      expect(await processus.fin).toEqual({ code: 1, signal: null });
      expect(processus.sortieDErreur()).toBe("Configuration invalide : URL_BASE_DONNEES\n");
      expect(processus.sortieStandard()).toBe("");
    },
    DELAI_DES_TESTS_DE_PROCESSUS_MS,
  );

  it(
    "F-008-AC25 sur un port déjà pris, le processus finit de lui-même en code 1 : une phrase fixe pour toute sortie d'erreur, rien sur la sortie standard, donc ni URL de connexion ni mot de passe",
    async () => {
      const occupe = await occuperUnPort();
      portsOccupes.push(occupe);

      const processus = lancer({ PORT: String(occupe.port), URL_BASE_DONNEES: URL_BASE_D_ESSAI });

      expect(await processus.fin).toEqual({ code: 1, signal: null });
      expect(processus.sortieDErreur()).toBe(
        "Écoute impossible sur l'adresse configurée : le serveur ne démarre pas.\n",
      );
      expect(processus.sortieStandard()).toBe("");
    },
    DELAI_DES_TESTS_DE_PROCESSUS_MS,
  );
});

describe("fichier d'exemple du serveur", () => {
  it("F-008-AC14 le mot de passe de l'URL d'exemple est celui que le serveur refuse en production", () => {
    const variables = variablesDe(EXEMPLE);

    expect(new URL(variables.URL_BASE_DONNEES ?? "").password).toBe(MOT_DE_PASSE_FACTICE);
    expect(lireConfiguration(variables)).toEqual({
      hote: "127.0.0.1",
      port: 3000,
      urlBaseDonnees: variables.URL_BASE_DONNEES,
      originesAutorisees: [],
    });
  });

  it("F-008-AC14 le fichier d'exemple ne fixe pas NODE_ENV : le mode de production de l'image n'est pas défait par lui", () => {
    const fixeLeMode = (texte: string): boolean => "NODE_ENV" in variablesDe(texte);

    expect(fixeLeMode(EXEMPLE)).toBe(false);
    expect(fixeLeMode(`NODE_ENV=development\n${EXEMPLE}`)).toBe(true);
  });
});

describe("service et arrêt", () => {
  it(
    "F-008-AC7 à SIGTERM, le processus qui a servi finit en code 0 en moins de 5 secondes, connexions à la base fermées",
    async () => {
      const { processus, url } = await lancerSurFauxPostgres();
      const pret = await fetch(`${url}${CHEMINS.pret}`);
      const debut = performance.now();

      processus.enfant.kill("SIGTERM");
      const sortie = await processus.fin;
      const duree = performance.now() - debut;

      expect(pret.status).toBe(200);
      expect(await pretDe(pret)).toEqual({ etat: "pret" });
      expect(sortie).toEqual({ code: 0, signal: null });
      expect(duree).toBeLessThan(5000);
      expect(processus.lignesDuJournal().map(({ message }) => message)).toEqual([
        "ecoute",
        "requete",
        "arret",
      ]);
      await expect(fetch(`${url}${CHEMINS.sante}`)).rejects.toThrow();
    },
    DELAI_DES_TESTS_DE_PROCESSUS_MS,
  );

  it(
    "F-008-AC7 à SIGTERM, la requête en cours reçoit sa réponse avant que le processus finisse en code 0",
    async () => {
      const { processus, url, faux } = await lancerSurFauxPostgres();
      const avant = await fetch(`${url}${CHEMINS.pret}`);
      faux.seTaire();

      // La requête est en cours quand sa sonde est parvenue à la base, qui ne lui répondra pas.
      const enCours = fetch(`${url}${CHEMINS.pret}`);
      await expect.poll(() => faux.messagesRecus).toEqual(["Q", "Q"]);
      processus.enfant.kill("SIGTERM");
      const reponse = await enCours;
      const sortie = await processus.fin;

      expect(await pretDe(avant)).toEqual({ etat: "pret" });
      expect(reponse.status).toBe(503);
      expect((await enveloppeDe(reponse)).code).toBe("base-indisponible");
      expect(sortie).toEqual({ code: 0, signal: null });
      expect(processus.lignesDuJournal().map(({ message }) => message)).toEqual([
        "ecoute",
        "requete",
        "base-indisponible",
        "requete",
        "arret",
      ]);
    },
    DELAI_DES_TESTS_DE_PROCESSUS_MS,
  );

  it(
    "F-008-AC7 à SIGTERM, le processus dit adieu à la base, et une base qui ne ferme pas ses connexions ne le retient pas : code 0 en moins de 5 secondes",
    async () => {
      const { processus, url, faux } = await lancerSurFauxPostgres({ neFermeJamais: true });
      const pret = await fetch(`${url}${CHEMINS.pret}`);
      const debut = performance.now();

      processus.enfant.kill("SIGTERM");
      const sortie = await processus.fin;
      const duree = performance.now() - debut;

      expect(pret.status).toBe(200);
      expect(await pretDe(pret)).toEqual({ etat: "pret" });
      expect(sortie).toEqual({ code: 0, signal: null });
      expect(faux.messagesRecus).toEqual(["Q", "X"]);
      expect(duree).toBeLessThan(5000);
      expect(processus.lignesDuJournal().map(({ message }) => message)).toEqual([
        "ecoute",
        "requete",
        "arret",
      ]);
    },
    DELAI_DES_TESTS_DE_PROCESSUS_MS,
  );

  it(
    "F-008-AC11 le processus n'écrit que des lignes JSON sur sa sortie standard, sans secret, et rien sur sa sortie d'erreur",
    async () => {
      const { processus, url } = await lancerSurFauxPostgres();
      const port = Number(new URL(url).port);

      await fetch(`${url}${CHEMINS.sante}`);
      processus.enfant.kill("SIGTERM");
      await processus.fin;

      expect(processus.lignesDuJournal()).toEqual([
        { niveau: "info", time: expect.any(String), message: "ecoute", hote: "127.0.0.1", port },
        expect.objectContaining({ message: "requete", chemin: "/sante", statut: 200 }),
        { niveau: "info", time: expect.any(String), message: "arret", hote: "127.0.0.1", port },
      ]);
      expect(processus.sortieStandard()).not.toContain(MOT_DE_PASSE_D_ESSAI);
      expect(processus.sortieDErreur()).toBe("");
    },
    DELAI_DES_TESTS_DE_PROCESSUS_MS,
  );

  it(
    "F-008-AC3 le processus démarre et sert quand la base est injoignable : GET /pret 503, GET /sante 200",
    async () => {
      const port = await portFerme();
      const processus = lancer({
        PORT: "0",
        URL_BASE_DONNEES: `postgres://essai:${MOT_DE_PASSE_D_ESSAI}@127.0.0.1:${port}/essai`,
      });
      const url = await urlDEcoute(processus);

      const pret = await fetch(`${url}${CHEMINS.pret}`);
      const sante = await fetch(`${url}${CHEMINS.sante}`);

      expect(pret.status).toBe(503);
      expect((await enveloppeDe(pret)).code).toBe("base-indisponible");
      expect(sante.status).toBe(200);
      expect(await santeDe(sante)).toEqual({ etat: "ok" });
      expect(processus.sortieStandard()).not.toContain(MOT_DE_PASSE_D_ESSAI);
    },
    DELAI_DES_TESTS_DE_PROCESSUS_MS,
  );

  it(
    "F-008-AC26 à SIGTERM, une fermeture de la base qui rejette par une erreur portant l'URL de connexion donne le code 1 et une phrase fixe, l'URL sur aucune des deux sorties",
    async () => {
      const processus = lancer(
        { PORT: "0", URL_BASE_DONNEES: URL_BASE_D_ESSAI },
        ENTREE_DONT_LA_BASE_NE_SE_FERME_PAS,
      );
      await urlDEcoute(processus);

      processus.enfant.kill("SIGTERM");

      expect(await processus.fin).toEqual({ code: 1, signal: null });
      expect(processus.sortieDErreur()).toBe(
        "Arrêt en échec : le serveur n'a pas pu tout fermer.\n",
      );
      expect(processus.lignesDuJournal().map(({ message }) => message)).toEqual(["ecoute"]);
      expect(processus.sortieStandard()).not.toContain(URL_BASE_D_ESSAI);
      expect(processus.sortieStandard()).not.toContain(MOT_DE_PASSE_D_ESSAI);
    },
    DELAI_DES_TESTS_DE_PROCESSUS_MS,
  );
});
