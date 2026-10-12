// F-009-AC24 : better-auth cantonné à apps/server, par sous-chemin. Les règles de
// `.dependency-cruiser.cjs` sont exécutées telles quelles, comme par `pnpm contrats` : sur le dépôt,
// puis sur des modules d'essai écrits dans un dossier temporaire, qui reproduisent l'arborescence
// du dépôt et importent chaque sous-chemin depuis chaque endroit.
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { cruise, type ICruiseResult } from "dependency-cruiser";
import { afterAll, describe, expect, it } from "vitest";

const RACINE = fileURLToPath(new URL("../../../", import.meta.url));
const MODULES_DU_SERVEUR = fileURLToPath(new URL("../node_modules", import.meta.url));
const REGLES_DE_F_009 = [
  "better-auth-reserve-au-serveur",
  "better-auth-client-un-seul-module",
  "better-auth-react-et-greffons-interdits",
];

interface Configuration {
  readonly forbidden: unknown[];
  readonly options: Record<string, unknown>;
}

const configuration = createRequire(import.meta.url)(
  join(RACINE, ".dependency-cruiser.cjs"),
) as Configuration;

const dossiers: string[] = [];

afterAll(() => {
  for (const dossier of dossiers.splice(0)) {
    rmSync(dossier, { recursive: true, force: true });
  }
});

async function croiser(baseDir: string, cibles: string[]): Promise<ICruiseResult> {
  const { output } = await cruise(cibles, {
    ...configuration.options,
    baseDir,
    validate: true,
    ruleSet: { forbidden: configuration.forbidden },
    outputType: "json",
  } as Parameters<typeof cruise>[1]);
  return (typeof output === "string" ? JSON.parse(output) : output) as ICruiseResult;
}

function violationsDeF009(resultat: ICruiseResult): string[] {
  return resultat.summary.violations
    .filter(({ rule }) => REGLES_DE_F_009.includes(rule.name))
    .map(({ rule, from }) => `${from} : ${rule.name}`)
    .sort();
}

// Chaque module d'essai importe un seul sous-chemin.
const IMPORTS: Readonly<Record<string, string>> = {
  "apps/server/src/racine.ts": "better-auth",
  "apps/server/src/adaptateur.ts": "better-auth/adapters/drizzle",
  "apps/server/src/paquet.ts": "@better-auth/drizzle-adapter",
  "apps/server/src/client.ts": "better-auth/client",
  "apps/server/src/react.ts": "better-auth/react",
  "apps/server/test/greffons.ts": "better-auth/client/plugins",
  "apps/web/src/racine.ts": "better-auth",
  "apps/web/src/api.ts": "better-auth/api",
  "apps/web/src/client.ts": "better-auth/client",
  "apps/web/src/react.ts": "better-auth/react",
  "apps/web/src/greffons.ts": "better-auth/client/plugins",
  "packages/db/src/adaptateur.ts": "better-auth/adapters/drizzle",
  "packages/db/src/paquet.ts": "@better-auth/drizzle-adapter",
  "packages/contrats/src/racine.ts": "better-auth",
  "packages/document/src/client.ts": "better-auth/client",
};

const ATTENDUES = [
  "apps/server/src/client.ts : better-auth-client-un-seul-module",
  "apps/server/src/react.ts : better-auth-react-et-greffons-interdits",
  "apps/server/test/greffons.ts : better-auth-react-et-greffons-interdits",
  "apps/web/src/api.ts : better-auth-reserve-au-serveur",
  "apps/web/src/client.ts : better-auth-client-un-seul-module",
  "apps/web/src/greffons.ts : better-auth-react-et-greffons-interdits",
  "apps/web/src/greffons.ts : better-auth-reserve-au-serveur",
  "apps/web/src/racine.ts : better-auth-reserve-au-serveur",
  "apps/web/src/react.ts : better-auth-react-et-greffons-interdits",
  "apps/web/src/react.ts : better-auth-reserve-au-serveur",
  "packages/contrats/src/racine.ts : better-auth-reserve-au-serveur",
  "packages/db/src/adaptateur.ts : better-auth-reserve-au-serveur",
  "packages/db/src/paquet.ts : better-auth-reserve-au-serveur",
  "packages/document/src/client.ts : better-auth-client-un-seul-module",
].sort();

// Un dépôt d'essai ; `installe` : chaque projet voit le better-auth installé d'apps/server, comme
// si chacun l'avait en dépendance, pour que la règle soit éprouvée sur le chemin résolu.
function depotDEssai(installe: boolean): string {
  const dossier = mkdtempSync(join(tmpdir(), "f009-ac24-"));
  dossiers.push(dossier);
  for (const [chemin, cible] of Object.entries(IMPORTS)) {
    mkdirSync(join(dossier, dirname(chemin)), { recursive: true });
    writeFileSync(
      join(dossier, chemin),
      `import * as module from "${cible}";\nexport { module };\n`,
    );
  }
  if (installe) {
    symlinkSync(MODULES_DU_SERVEUR, join(dossier, "node_modules"), "dir");
  }
  return dossier;
}

describe("better-auth cantonné au serveur", () => {
  it("F-009-AC24 sur le dépôt, aucune violation, et le serveur importe bien better-auth par son chemin installé", async () => {
    const resultat = await croiser(RACINE, ["apps", "packages"]);
    const versBetterAuth = resultat.modules
      .filter(({ source }) => source.startsWith("apps/server/src/"))
      .flatMap(({ dependencies }) => dependencies.map(({ resolved }) => resolved))
      .filter((resolu) => /node_modules\/(better-auth|@better-auth\/[^/]+)\//.test(resolu));

    expect(resultat.summary.violations).toEqual([]);
    expect(versBetterAuth.length).toBeGreaterThan(0);
  });

  it.each([
    ["installé", true],
    ["non installé", false],
  ])(
    "F-009-AC24 better-auth %s : chaque import interdit par sous-chemin est vu, et ceux du serveur sont permis",
    async (_cas, installe) => {
      const dossier = depotDEssai(installe);

      const resultat = await croiser(dossier, ["apps", "packages"]);
      const resolus = resultat.modules.flatMap(({ dependencies }) =>
        dependencies.map(({ resolved }) => resolved),
      );

      expect(violationsDeF009(resultat)).toEqual(ATTENDUES);
      expect(resolus.some((resolu) => resolu.includes("node_modules/"))).toBe(installe);
    },
  );
});
