import { describe, expect, it } from "vitest";

import manifeste from "../package.json" with { type: "json" };

type Manifeste = Readonly<
  Partial<Record<"dependencies" | "peerDependencies" | "optionalDependencies", object>>
>;

function dependancesExecution(lu: Manifeste): string[] {
  return [lu.dependencies, lu.peerDependencies, lu.optionalDependencies].flatMap((section) =>
    Object.keys(section ?? {}),
  );
}

const MANIFESTES_FAUTIFS: readonly (readonly [string, Manifeste])[] = [
  ["ajoute express", { dependencies: { zod: "4.6.5", express: "5.2.1" } }],
  ["remplace zod", { dependencies: { yjs: "13.6.0" } }],
  ["n'a aucune dépendance", {}],
  [
    "ajoute une dépendance de pair",
    { dependencies: { zod: "4.6.5" }, peerDependencies: { pg: "8.23.1" } },
  ],
  [
    "ajoute une dépendance facultative",
    { dependencies: { zod: "4.6.5" }, optionalDependencies: { pino: "10.3.1" } },
  ],
];

describe("structure du paquet", () => {
  it("F-008-AC23 zod est la seule dépendance d'exécution directe du manifeste", () => {
    expect(dependancesExecution(manifeste)).toEqual(["zod"]);
  });

  it.each(MANIFESTES_FAUTIFS)("F-008-AC23 un manifeste qui %s est vu fautif", (_defaut, fautif) => {
    expect(dependancesExecution(fautif)).not.toEqual(["zod"]);
  });
});
