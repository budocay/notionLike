// Règle `serveur-verification-de-configuration-confinee` de `.dependency-cruiser.cjs` (F-031 H6,
// ADR-0017) : l'entrée de vérification et configuration.ts n'atteignent que configuration.ts et zod.
// Rejoue en test l'essai manuel E5 de la note de conception, sur le modèle de
// apps/server/test/dependances-better-auth.test.ts : l'outil de `pnpm contrats` est lancé sur le
// dépôt, puis sur un dépôt d'essai écrit dans un dossier temporaire, qui reproduit les deux chemins
// visés et y glisse des imports interdits. Placé sous infra/tests : la règle protège la commande de
// la pile (infra/pile.sh lance l'entrée avec les secrets du service), et apps/server est à
// agent-backend.
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { DEPOT } from "./aides-pile.ts";

const REGLE = "serveur-verification-de-configuration-confinee";
const DEPCRUISE = join(DEPOT, "node_modules", ".bin", "depcruise");
const MODULES_DU_SERVEUR = join(DEPOT, "apps", "server", "node_modules");
// Un croisement lance dependency-cruiser dans un processus : quelques secondes quand toute la suite
// tourne en parallèle, au-delà des 5 s par défaut d'un test.
const DELAI_D_UN_CROISEMENT_MS = 30_000;
const ENTREE = "apps/server/src/verifier-configuration.ts";
const CONFIGURATION = "apps/server/src/configuration.ts";

interface Resultat {
  readonly modules: readonly { readonly source: string }[];
  readonly summary: {
    readonly violations: readonly {
      readonly from: string;
      readonly to: string;
      readonly rule: { readonly name: string };
    }[];
  };
}

const dossiers: string[] = [];

afterAll(() => {
  for (const dossier of dossiers.splice(0)) {
    rmSync(dossier, { recursive: true, force: true });
  }
});

function croiser(baseDir: string, cibles: readonly string[]): Resultat {
  const execution = spawnSync(
    DEPCRUISE,
    ["--config", join(DEPOT, ".dependency-cruiser.cjs"), "--output-type", "json", ...cibles],
    {
      cwd: baseDir,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${dirname(process.execPath)}${delimiter}${process.env.PATH ?? ""}`,
      },
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  expect(execution.error).toBeUndefined();
  return JSON.parse(execution.stdout) as Resultat;
}

function violationsDeLaRegle(resultat: Resultat): string[] {
  return (
    resultat.summary.violations
      .filter(({ rule }) => rule.name === REGLE)
      // Un paquet installé est nommé par son nom, quel que soit le chemin de pnpm qui le porte.
      .map(
        ({ from, to }) =>
          `${from} -> ${to.replace(/^.*node_modules\/((?:@[^/]+\/)?[^/]+)\/.*$/, "paquet $1")}`,
      )
      .sort()
  );
}

function depotDEssai(fichiers: Readonly<Record<string, string>>): string {
  const dossier = mkdtempSync(join(tmpdir(), "f031-confinee-"));
  dossiers.push(dossier);
  for (const [chemin, texte] of Object.entries(fichiers)) {
    mkdirSync(join(dossier, dirname(chemin)), { recursive: true });
    writeFileSync(join(dossier, chemin), texte);
  }
  // zod et express résolus par leur chemin installé, comme dans le dépôt.
  symlinkSync(MODULES_DU_SERVEUR, join(dossier, "node_modules"), "dir");
  return dossier;
}

const PERMIS: Readonly<Record<string, string>> = {
  [CONFIGURATION]: 'import { z } from "zod";\nexport const schema = z.string();\n',
  [ENTREE]: 'import { schema } from "./configuration.ts";\nexport { schema };\n',
  "apps/server/src/base.ts": "export const base = 1;\n",
  "apps/server/src/autre.ts":
    'import { createServer } from "node:net";\nexport { createServer };\n',
};

describe("vérification de la configuration confinée (règle de dépendances)", () => {
  it(
    "F-031-AC8 sur le dépôt, l'entrée de vérification n'atteint que configuration.ts et zod : aucune violation de la règle",
    () => {
      const resultat = croiser(DEPOT, ["apps/server/src"]);
      const sources = resultat.modules.map(({ source }) => source);

      expect(sources).toEqual(expect.arrayContaining([ENTREE, CONFIGURATION]));
      expect(violationsDeLaRegle(resultat)).toEqual([]);
    },
    DELAI_D_UN_CROISEMENT_MS,
  );

  it(
    "F-031-AC8 un dépôt d'essai aux seuls imports permis ne viole pas la règle ; un autre module du serveur n'y est pas soumis",
    () => {
      expect(violationsDeLaRegle(croiser(depotDEssai(PERMIS), ["apps"]))).toEqual([]);
    },
    DELAI_D_UN_CROISEMENT_MS,
  );

  it(
    "F-031-AC8 cas fautif : un module de Node, un autre module du serveur, un paquet ou un import dynamique sont vus",
    () => {
      const dossier = depotDEssai({
        ...PERMIS,
        [CONFIGURATION]:
          'import { z } from "zod";\nimport { connect } from "node:net";\n' +
          "export const schema = z.string();\nexport { connect };\n",
        [ENTREE]:
          'import { schema } from "./configuration.ts";\nimport { base } from "./base.ts";\n' +
          'import express from "express";\nconst http = await import("node:http");\n' +
          "export { schema, base, express, http };\n",
      });

      const violations = violationsDeLaRegle(croiser(dossier, ["apps"]));

      expect(violations).toEqual(
        [
          `${CONFIGURATION} -> net`,
          `${ENTREE} -> apps/server/src/base.ts`,
          `${ENTREE} -> http`,
          `${ENTREE} -> paquet express`,
        ].sort(),
      );
    },
    DELAI_D_UN_CROISEMENT_MS,
  );
});
