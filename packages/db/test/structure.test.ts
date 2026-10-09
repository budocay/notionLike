import { describe, expect, it } from "vitest";

import manifeste from "../package.json" with { type: "json" };
// Les deux fichiers que le manifeste publie (`ENTREES`), importés en entier pour lire leurs exports.
import * as entreePublique from "../src/index.ts";
import * as entreeDEssai from "./essai.ts";

interface ManifesteLu {
  readonly exports?: Readonly<Record<string, string>>;
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly devDependencies?: Readonly<Record<string, string>>;
  readonly peerDependencies?: Readonly<Record<string, string>>;
  readonly optionalDependencies?: Readonly<Record<string, string>>;
}

const DEPENDANCES_D_EXECUTION = ["drizzle-orm", "pg"];
const MOTEUR_EMBARQUE = "@electric-sql/pglite";
const ENTREES = { ".": "./src/index.ts", "./essai": "./test/essai.ts" };

// Rend la liste des fautes du manifeste ; vide s'il est conforme.
function fautesDuManifeste(lu: ManifesteLu): string[] {
  const fautes: string[] = [];
  const execution = Object.keys(lu.dependencies ?? {}).sort();
  if (JSON.stringify(execution) !== JSON.stringify(DEPENDANCES_D_EXECUTION)) {
    fautes.push(`dépendances d'exécution : ${execution.join(", ")}`);
  }
  const installeesHorsDeveloppement = [
    ...Object.keys(lu.peerDependencies ?? {}),
    ...Object.keys(lu.optionalDependencies ?? {}),
  ];
  if (installeesHorsDeveloppement.length > 0) {
    fautes.push(`dépendances de pair ou optionnelles : ${installeesHorsDeveloppement.join(", ")}`);
  }
  if (!Object.hasOwn(lu.devDependencies ?? {}, MOTEUR_EMBARQUE)) {
    fautes.push("le moteur embarqué n'est pas une dépendance de développement");
  }
  if (JSON.stringify(lu.exports) !== JSON.stringify(ENTREES)) {
    fautes.push(`entrées : ${JSON.stringify(lu.exports)}`);
  }
  return fautes;
}

const CONFORME: ManifesteLu = {
  exports: ENTREES,
  dependencies: { "drizzle-orm": "0.45.3", pg: "8.23.1" },
  devDependencies: { [MOTEUR_EMBARQUE]: "0.5.8" },
};

describe("structure du paquet", () => {
  it("F-008-AC23 le manifeste n'a que drizzle-orm et pg en dépendances d'exécution, PGlite en développement", () => {
    expect(fautesDuManifeste(manifeste)).toEqual([]);
    expect(fautesDuManifeste(CONFORME)).toEqual([]);
  });

  it.each<[string, ManifesteLu, string]>([
    [
      "@notionlike/contrats en dépendance",
      { ...CONFORME, dependencies: { ...CONFORME.dependencies, "@notionlike/contrats": "*" } },
      "dépendances d'exécution : @notionlike/contrats, drizzle-orm, pg",
    ],
    [
      "express en dépendance",
      { ...CONFORME, dependencies: { ...CONFORME.dependencies, express: "5.2.1" } },
      "dépendances d'exécution : drizzle-orm, express, pg",
    ],
    [
      "PGlite en dépendance d'exécution",
      { ...CONFORME, dependencies: { ...CONFORME.dependencies, [MOTEUR_EMBARQUE]: "0.5.8" } },
      "dépendances d'exécution : @electric-sql/pglite, drizzle-orm, pg",
    ],
    [
      "pg retiré",
      { ...CONFORME, dependencies: { "drizzle-orm": "0.45.3" } },
      "dépendances d'exécution : drizzle-orm",
    ],
    [
      "express en dépendance de pair",
      { ...CONFORME, peerDependencies: { express: "5.2.1" } },
      "dépendances de pair ou optionnelles : express",
    ],
    [
      "PGlite en dépendance optionnelle",
      { ...CONFORME, optionalDependencies: { [MOTEUR_EMBARQUE]: "0.5.8" } },
      "dépendances de pair ou optionnelles : @electric-sql/pglite",
    ],
    [
      "PGlite absent du développement",
      { ...CONFORME, devDependencies: {} },
      "le moteur embarqué n'est pas une dépendance de développement",
    ],
    [
      "entrée d'essai qui désigne src",
      { ...CONFORME, exports: { ...ENTREES, "./essai": "./src/essai.ts" } },
      'entrées : {".":"./src/index.ts","./essai":"./src/essai.ts"}',
    ],
    [
      "entrée en plus vers un fichier interne",
      { ...CONFORME, exports: { ...ENTREES, "./acces": "./src/acces.ts" } },
      'entrées : {".":"./src/index.ts","./essai":"./test/essai.ts","./acces":"./src/acces.ts"}',
    ],
  ])("F-008-AC23 un manifeste fautif est refusé : %s", (_cas, fautif, faute) => {
    expect(fautesDuManifeste(fautif)).toEqual([faute]);
  });

  it("F-008-AC17 l'entrée publique n'exporte que ouvrirBase et ErreurBase", () => {
    expect(Object.keys(entreePublique).sort()).toEqual(["ErreurBase", "ouvrirBase"]);
  });

  it("F-008-AC18 l'entrée d'essai n'exporte que la base embarquée, le faux serveur et le port fermé", () => {
    expect(Object.keys(entreeDEssai).sort()).toEqual([
      "demarrerFauxPostgres",
      "ouvrirBaseEmbarquee",
      "portFerme",
    ]);
  });
});
