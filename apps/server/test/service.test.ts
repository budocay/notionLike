// Le service dans un processus témoin : ce qu'il lui demande, et dans quel ordre. Le processus
// réel est exercé par processus.test.ts.
import type { Base } from "@notionlike/db";
import { ouvrirBaseEmbarquee, type BaseEmbarquee } from "@notionlike/db/essai";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { lireConfiguration } from "../src/configuration.ts";
import { demarrerServeur } from "../src/serveur.ts";
import { servir } from "../src/service.ts";
import { ENV_D_ESSAI, occuperUnPort, URL_BASE_D_ESSAI, type PortOccupe } from "./aides.ts";

const PHRASE = "Écoute impossible sur l'adresse configurée : le serveur ne démarre pas.\n";

let embarquee: BaseEmbarquee;
let occupe: PortOccupe;

beforeAll(async () => {
  embarquee = await ouvrirBaseEmbarquee();
  occupe = await occuperUnPort();
});
afterAll(async () => {
  await occupe.liberer();
  await embarquee.base.fermer();
});

// Ce que le service a fait du processus et de la base, dans l'ordre.
const faits: string[] = [];
afterEach(() => {
  faits.length = 0;
});

const processusTemoin = {
  stdout: { write: (ligne: string) => void faits.push(`journal : ${ligne}`) },
  stderr: {
    write: (texte: string, ecrit: () => void) => {
      faits.push(`sortie d'erreur : ${texte}`);
      ecrit();
    },
  },
  once: (signal: string) => faits.push(`écoute de ${signal}`),
  exit: (code: number) => faits.push(`sortie en code ${code}`),
};

function servirSurLePortOccupe(fermer: Base["fermer"]): Promise<void> {
  return servir({
    configuration: lireConfiguration({
      ...ENV_D_ESSAI,
      PORT: String(occupe.port),
    }),
    base: { db: embarquee.base.db, sonder: () => embarquee.base.sonder(), fermer },
    processus: processusTemoin,
  });
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
    await servirSurLePortOccupe(() => {
      faits.push("base fermée");
      return Promise.resolve();
    });

    expect(faits).toEqual(["base fermée", `sortie d'erreur : ${PHRASE}`, "sortie en code 1"]);
  });

  it("F-008-AC25 une fermeture de la base qui rejette par une erreur portant l'URL de connexion ne change ni la phrase ni le code", async () => {
    await servirSurLePortOccupe(() => Promise.reject(new Error(`échec vers ${URL_BASE_D_ESSAI}`)));

    expect(faits).toEqual([`sortie d'erreur : ${PHRASE}`, "sortie en code 1"]);
  });
});
