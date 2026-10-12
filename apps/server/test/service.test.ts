// Le service dans un processus témoin : ce qu'il lui demande, et dans quel ordre. Le processus
// réel est exercé par processus.test.ts.
import type { Base } from "@notionlike/db";
import { ouvrirBaseEmbarquee, type BaseEmbarquee } from "@notionlike/db/essai";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { lireConfiguration } from "../src/configuration.ts";
import { demarrerServeur } from "../src/serveur.ts";
import { servir } from "../src/service.ts";
import {
  attendre,
  DELAI_D_OUVERTURE_D_UNE_BASE_MS,
  MOT_DE_PASSE_D_ESSAI,
  occuperUnPort,
  URL_BASE_D_ESSAI,
  type PortOccupe,
} from "./aides.ts";

const PHRASE = "Écoute impossible sur l'adresse configurée : le serveur ne démarre pas.\n";
const ARRET_EN_ECHEC = "Arrêt en échec : le serveur n'a pas pu tout fermer.\n";
// Le temps laissé à un effet tardif pour se montrer, s'il en existait un.
const PAUSE_D_OBSERVATION_MS = 50;

let embarquee: BaseEmbarquee;
let occupe: PortOccupe;

beforeAll(async () => {
  embarquee = await ouvrirBaseEmbarquee();
  occupe = await occuperUnPort();
}, DELAI_D_OUVERTURE_D_UNE_BASE_MS);
afterAll(async () => {
  await occupe.liberer();
  await embarquee.base.fermer();
});

// Ce que le service a fait du processus et de la base, dans l'ordre ; les lignes du journal y
// sont réduites à leur message.
const faits: string[] = [];
// Les écouteurs de SIGTERM posés par le service : `envoyerSigterm` les appelle comme le ferait
// le processus.
const ecouteursDeSigterm: (() => void)[] = [];
afterEach(() => {
  faits.length = 0;
  ecouteursDeSigterm.length = 0;
});

function envoyerSigterm(): void {
  for (const ecouteur of ecouteursDeSigterm.splice(0)) {
    ecouteur();
  }
}

const processusTemoin = {
  stdout: {
    write: (ligne: string) =>
      void faits.push(`journal : ${String((JSON.parse(ligne) as { message: unknown }).message)}`),
  },
  stderr: {
    write: (texte: string, ecrit: () => void) => {
      faits.push(`sortie d'erreur : ${texte}`);
      ecrit();
    },
  },
  once: (signal: string, ecouteur: () => void) => {
    faits.push(`écoute de ${signal}`);
    ecouteursDeSigterm.push(ecouteur);
  },
  exit: (code: number) => faits.push(`sortie en code ${code}`),
};

function baseQui(fermer: Base["fermer"]): Base {
  return { db: embarquee.base.db, sonder: () => embarquee.base.sonder(), fermer };
}

function fermetureNotee(): Promise<void> {
  faits.push("base fermée");
  return Promise.resolve();
}

function servirSurLePort(port: number, fermer: Base["fermer"]): Promise<void> {
  return servir({
    configuration: lireConfiguration({ PORT: String(port), URL_BASE_DONNEES: URL_BASE_D_ESSAI }),
    base: baseQui(fermer),
    processus: processusTemoin,
  });
}

function servirSurLePortOccupe(fermer: Base["fermer"]): Promise<void> {
  return servirSurLePort(occupe.port, fermer);
}

describe("écoute impossible", () => {
  it("F-008-AC25 demarrerServeur rejette quand le port est déjà pris", async () => {
    const ecoute = demarrerServeur({
      application: () => undefined,
      hote: "127.0.0.1",
      port: occupe.port,
      delaiArretMs: 1000,
    });

    await expect(ecoute).rejects.toMatchObject({ code: "EADDRINUSE" });
  });

  it("F-008-AC25 la base est fermée, puis la phrase fixe est écrite, puis le processus sort en code 1, sans rien journaliser", async () => {
    await servirSurLePortOccupe(fermetureNotee);

    expect(faits).toEqual([
      "écoute de SIGTERM",
      "base fermée",
      `sortie d'erreur : ${PHRASE}`,
      "sortie en code 1",
    ]);
  });

  it("F-008-AC25 une fermeture de la base qui rejette par une erreur portant l'URL de connexion ne change ni la phrase ni le code", async () => {
    await servirSurLePortOccupe(() => Promise.reject(new Error(`échec vers ${URL_BASE_D_ESSAI}`)));

    expect(faits).toEqual(["écoute de SIGTERM", `sortie d'erreur : ${PHRASE}`, "sortie en code 1"]);
  });

  it("F-008-AC25 après l'échec de l'écoute, le service s'arrête là : rien n'est journalisé, aucun autre écouteur n'est posé, et un SIGTERM reçu ensuite ne fait rien", async () => {
    await servirSurLePortOccupe(fermetureNotee);
    const apresLEchec = [...faits];
    envoyerSigterm();
    await attendre(PAUSE_D_OBSERVATION_MS);

    expect(faits).toEqual(apresLEchec);
    expect(faits.filter((fait) => fait.startsWith("journal : "))).toEqual([]);
    expect(faits.filter((fait) => fait.startsWith("écoute de "))).toEqual(["écoute de SIGTERM"]);
    expect(faits).not.toContain("sortie en code 0");
    expect(faits.filter((fait) => fait === "base fermée")).toHaveLength(1);
  });
});

describe("initialisation impossible", () => {
  const INITIALISATION = "Initialisation impossible : le serveur ne démarre pas.\n";

  // `servir` d'un service dont la composition de l'application lève, par une erreur qui porte
  // l'URL de connexion comme le ferait une erreur du pilote.
  async function servirSansApplication(fermer: Base["fermer"]): Promise<void> {
    vi.resetModules();
    vi.doMock("../src/application.ts", () => ({
      creerApplication: () => {
        throw new Error(`composition en échec vers ${URL_BASE_D_ESSAI}`);
      },
    }));
    try {
      const service = await import("../src/service.ts");
      await service.servir({
        configuration: lireConfiguration({ PORT: "0", URL_BASE_DONNEES: URL_BASE_D_ESSAI }),
        base: baseQui(fermer),
        processus: processusTemoin,
      });
    } finally {
      vi.doUnmock("../src/application.ts");
      vi.resetModules();
    }
  }

  it("F-008-AC25 une composition qui lève ferme la base, écrit une phrase fixe sans l'erreur et sort en code 1, sans rien écouter ni journaliser", async () => {
    await servirSansApplication(fermetureNotee);

    expect(faits).toEqual([
      "écoute de SIGTERM",
      "base fermée",
      `sortie d'erreur : ${INITIALISATION}`,
      "sortie en code 1",
    ]);
    expect(faits.join("\n")).not.toContain(MOT_DE_PASSE_D_ESSAI);
  });

  it("F-008-AC25 une composition qui lève et une fermeture de la base qui rejette donnent la même phrase et le même code", async () => {
    await servirSansApplication(() =>
      Promise.reject(new Error(`fermeture en échec vers ${URL_BASE_D_ESSAI}`)),
    );

    expect(faits).toEqual([
      "écoute de SIGTERM",
      `sortie d'erreur : ${INITIALISATION}`,
      "sortie en code 1",
    ]);
  });
});

describe("SIGTERM pendant le démarrage", () => {
  it("F-008-AC7 l'écouteur de SIGTERM est posé avant que l'écoute n'aboutisse ; reçu pendant l'écoute, il arrête le serveur dès qu'il sert, ferme la base et sort en code 0", async () => {
    const service = servirSurLePort(0, fermetureNotee);
    const avantLEcoute = [...faits];
    envoyerSigterm();
    await service;
    await expect.poll(() => faits.at(-1)).toBe("sortie en code 0");

    expect(avantLEcoute).toEqual(["écoute de SIGTERM"]);
    expect(faits).toEqual([
      "écoute de SIGTERM",
      "journal : ecoute",
      "base fermée",
      "journal : arret",
      "sortie en code 0",
    ]);
  });

  it("F-008-AC26 reçu pendant l'écoute, un arrêt dont la fermeture de la base rejette donne la phrase fixe et le code 1", async () => {
    const service = servirSurLePort(0, () =>
      Promise.reject(new Error(`fermeture en échec vers ${URL_BASE_D_ESSAI}`)),
    );
    envoyerSigterm();
    await service;
    await expect.poll(() => faits.at(-1)).toBe("sortie en code 1");

    expect(faits).toEqual([
      "écoute de SIGTERM",
      "journal : ecoute",
      `sortie d'erreur : ${ARRET_EN_ECHEC}`,
      "sortie en code 1",
    ]);
    expect(faits.join("\n")).not.toContain(MOT_DE_PASSE_D_ESSAI);
  });
});
