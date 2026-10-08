import { describe, expect, it } from "vitest";

import manifeste from "../package.json" with { type: "json" };

describe("structure du paquet", () => {
  it("F-001-AC19 yjs est la seule dépendance d'exécution directe du manifeste", () => {
    expect(Object.keys(manifeste.dependencies)).toEqual(["yjs"]);
  });

  it("F-001-AC19 les tests s'exécutent sous Node sans DOM", () => {
    expect("window" in globalThis).toBe(false);
    expect("document" in globalThis).toBe(false);
  });
});
