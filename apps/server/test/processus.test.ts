// Le processus réel : `node apps/server/src/main.ts`, lancé depuis la racine du dépôt comme dans
// l'image, sans Vitest entre les deux. Node y charge les trois paquets par leurs sources (ADR-0006).
import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer, type AddressInfo, type Server, type Socket } from "node:net";
import { fileURLToPath } from "node:url";

import { CHEMINS, schemaEnveloppeErreur, schemaReponsePret } from "@notionlike/contrats";
import { demarrerFauxPostgres, portFerme, type FauxPostgres } from "@notionlike/db/essai";
import { afterEach, describe, expect, it } from "vitest";

import { constatsValeursFactices, lireExemple } from "../../../infra/tests/regles/exemples.ts";
import { lireConfiguration, MOT_DE_PASSE_FACTICE } from "../src/configuration.ts";
import { type LigneDeJournal, MOT_DE_PASSE_D_ESSAI } from "./aides.ts";

const RACINE = fileURLToPath(new URL("../../../", import.meta.url));
const EXEMPLE = readFileSync(new URL("../.env.example", import.meta.url), "utf8");
const DELAI_DES_TESTS_DE_PROCESSUS_MS = 20_000;
const MARQUEUR = "valeur-fautive-a-ne-pas-afficher";

type Environnement = Readonly<Record<string, string>>;

interface Sortie {
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
}

interface Processus {
  readonly enfant: ChildProcess;
  readonly fin: Promise<Sortie>;
  sortieStandard(): string;
  sortieDErreur(): string;
  lignes(): LigneDeJournal[];
}

const lances: Processus[] = [];
const fauxServeurs: FauxPostgres[] = [];
const basesFigees = new Set<Socket>();

// L'environnement de l'enfant est exactement celui du test : rien n'est hérité de Vitest.
function lancer(env: Environnement): Processus {
  const enfant = spawn(process.execPath, ["apps/server/src/main.ts"], { cwd: RACINE, env });
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
    lignes: () =>
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

async function lancerSurFauxPostgres(): Promise<ProcessusServi> {
  const faux = await demarrerFauxPostgres(MOT_DE_PASSE_D_ESSAI);
  fauxServeurs.push(faux);
  const processus = lancer({ PORT: "0", URL_BASE_DONNEES: faux.url });
  return { processus, url: await urlDEcoute(processus), faux };
}

// Attend la ligne `ecoute` du journal et rend l'adresse où le processus sert.
async function urlDEcoute(processus: Processus): Promise<string> {
  const ligne = await expect
    .poll(() => processus.lignes().find(({ message }) => message === "ecoute"), { timeout: 10_000 })
    .toBeDefined()
    .then(() => processus.lignes().find(({ message }) => message === "ecoute"));
  return `http://${String(ligne?.hote)}:${String(ligne?.port)}`;
}

function trame(type: string, corps: Buffer): Buffer {
  const entete = Buffer.alloc(5);
  entete.write(type, 0, "latin1");
  entete.writeInt32BE(4 + corps.length, 1);
  return Buffer.concat([entete, corps]);
}

const CONNEXION_ACCEPTEE = Buffer.concat([
  trame("R", Buffer.alloc(4)),
  trame("Z", Buffer.from("I", "latin1")),
]);
const REQUETE_FINIE = Buffer.concat([
  trame("C", Buffer.from("SELECT 0\0", "latin1")),
  trame("Z", Buffer.from("I", "latin1")),
]);

// Une base qui répond aux requêtes mais ne ferme jamais son côté d'une connexion, comme une base
// figée (conteneur en pause) au moment de l'arrêt : le pilote `pg` y attend sans fin la fermeture.
// Le faux serveur de `@notionlike/db/essai`, lui, ferme toujours le sien.
interface BaseFigee {
  readonly url: string;
  readonly serveur: Server;
  // Types des messages reçus après l'ouverture : `Q` pour une requête, `X` pour l'adieu du pilote.
  readonly recus: string[];
}

function demarrerBaseQuiNeFermePas(): Promise<BaseFigee> {
  const recus: string[] = [];
  const serveur = createServer({ allowHalfOpen: true }, (connexion: Socket) => {
    basesFigees.add(connexion);
    connexion.on("error", () => connexion.destroy());
    connexion.once("data", () => {
      connexion.write(CONNEXION_ACCEPTEE);
      connexion.on("data", (message: Buffer) => {
        recus.push(message.toString("latin1", 0, 1));
        if (recus.at(-1) === "Q") {
          connexion.write(REQUETE_FINIE);
        }
      });
    });
  });
  return new Promise((resolve) => {
    serveur.listen(0, "127.0.0.1", () => {
      const { port } = serveur.address() as AddressInfo;
      const url = `postgres://essai:${MOT_DE_PASSE_D_ESSAI}@127.0.0.1:${port}/essai`;
      resolve({ url, serveur, recus });
    });
  });
}

function variablesDe(texte: string): Environnement {
  return Object.fromEntries(lireExemple(texte).map(({ cle, valeur }) => [cle, valeur]));
}

afterEach(async () => {
  for (const { enfant, fin } of lances.splice(0)) {
    enfant.kill("SIGKILL");
    await fin;
  }
  await Promise.all(fauxServeurs.splice(0).map((faux) => faux.arreter()));
  basesFigees.forEach((connexion) => connexion.destroy());
  basesFigees.clear();
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
});

describe("fichier d'exemple du serveur", () => {
  it("F-008-AC13 apps/server/.env.example ne porte qu'un secret, factice et marqué comme tel", () => {
    const exemple = lireExemple(EXEMPLE);

    expect(constatsValeursFactices(exemple)).toEqual([]);
    expect(exemple.map(({ cle }) => cle)).toEqual([
      "HOTE",
      "PORT",
      "URL_BASE_DONNEES",
      "ORIGINES_AUTORISEES",
    ]);
  });

  it("F-008-AC13 un fichier d'exemple qui porte un vrai secret, ou un secret que rien ne dit factice, est vu", () => {
    const vraiSecret = EXEMPLE.replace(MOT_DE_PASSE_FACTICE, "Xo4kPq81zZ");
    const sansMarque = EXEMPLE.replace(/^# Mot de passe factice.*\n/m, "");

    expect(vraiSecret).not.toBe(EXEMPLE);
    expect(sansMarque).not.toBe(EXEMPLE);
    expect(constatsValeursFactices(lireExemple(vraiSecret))).toEqual([
      "URL_BASE_DONNEES : la valeur n'est pas factice",
    ]);
    expect(constatsValeursFactices(lireExemple(sansMarque))).toEqual([
      "URL_BASE_DONNEES : aucun commentaire ne la dit factice",
    ]);
  });

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
      expect(schemaReponsePret.parse(await pret.json())).toEqual({ etat: "pret" });
      expect(sortie).toEqual({ code: 0, signal: null });
      expect(duree).toBeLessThan(5000);
      expect(processus.lignes().map(({ message }) => message)).toEqual([
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
      await fetch(`${url}${CHEMINS.pret}`);
      faux.seTaire();

      const enCours = fetch(`${url}${CHEMINS.pret}`);
      await expect.poll(() => processus.lignes().length).toBe(2);
      await new Promise((resolve) => setTimeout(resolve, 200));
      processus.enfant.kill("SIGTERM");
      const reponse = await enCours;
      const sortie = await processus.fin;

      expect(reponse.status).toBe(503);
      expect(schemaEnveloppeErreur.parse(await reponse.json()).code).toBe("base-indisponible");
      expect(sortie).toEqual({ code: 0, signal: null });
    },
    DELAI_DES_TESTS_DE_PROCESSUS_MS,
  );

  it(
    "F-008-AC7 à SIGTERM, le processus dit adieu à la base, et une base qui ne ferme pas ses connexions ne le retient pas : code 0 en moins de 5 secondes",
    async () => {
      const figee = await demarrerBaseQuiNeFermePas();
      const processus = lancer({ PORT: "0", URL_BASE_DONNEES: figee.url });
      const pret = await fetch(`${await urlDEcoute(processus)}${CHEMINS.pret}`);
      const debut = performance.now();

      processus.enfant.kill("SIGTERM");
      const sortie = await processus.fin;
      const duree = performance.now() - debut;
      figee.serveur.close();

      expect(pret.status).toBe(200);
      expect(sortie).toEqual({ code: 0, signal: null });
      expect(figee.recus).toEqual(["Q", "X"]);
      expect(duree).toBeLessThan(5000);
      expect(processus.lignes().map(({ message }) => message)).toEqual([
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

      expect(processus.lignes()).toEqual([
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
      expect(schemaEnveloppeErreur.parse(await pret.json()).code).toBe("base-indisponible");
      expect(sante.status).toBe(200);
      expect(processus.sortieStandard()).not.toContain(MOT_DE_PASSE_D_ESSAI);
    },
    DELAI_DES_TESTS_DE_PROCESSUS_MS,
  );
});
