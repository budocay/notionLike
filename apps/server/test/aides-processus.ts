// Aides des tests du processus réel : `node <entrée>` lancé depuis la racine du dépôt comme dans
// l'image, sans Vitest entre les deux. Ses deux sorties sont gardées en entier.
import { spawn, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";

import { expect } from "vitest";

import type { Environnement } from "../src/configuration.ts";
import type { LigneDeJournal } from "./aides.ts";

export const RACINE = fileURLToPath(new URL("../../../", import.meta.url));
export const ENTREE = "apps/server/src/main.ts";
export const DELAI_DES_TESTS_DE_PROCESSUS_MS = 20_000;

interface FinDuProcessus {
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
}

export interface Processus {
  readonly enfant: ChildProcess;
  readonly fin: Promise<FinDuProcessus>;
  sortieStandard(): string;
  sortieDErreur(): string;
  lignesDuJournal(): LigneDeJournal[];
}

const lances: Processus[] = [];

// L'environnement de l'enfant est exactement celui du test : rien n'est hérité de Vitest.
export function lancer(env: Environnement, entree = ENTREE): Processus {
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

// Attend la ligne `ecoute` du journal et rend l'adresse où le processus sert.
export async function urlDEcoute(processus: Processus, delaiMs = 10_000): Promise<string> {
  const ligne = await expect
    .poll(() => processus.lignesDuJournal().find(({ message }) => message === "ecoute"), {
      timeout: delaiMs,
    })
    .toBeDefined()
    .then(() => processus.lignesDuJournal().find(({ message }) => message === "ecoute"));
  return `http://${String(ligne?.hote)}:${String(ligne?.port)}`;
}

// À appeler après chaque test : tue les processus lancés et attend leur fin.
export async function arreterLesProcessus(): Promise<void> {
  for (const { enfant, fin } of lances.splice(0)) {
    enfant.kill("SIGKILL");
    await fin;
  }
}
