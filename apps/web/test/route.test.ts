import { describe, expect, it } from "vitest";

import { fragmentDe, lireRoute, type Route } from "../src/navigation/route.ts";

const ID = "3f0e7a52-9c1b-4d6e-8a2f-5b7c9d1e0f34";
const ACCUEIL: Route = { forme: "accueil" };

describe("route", () => {
  it.each<[string, Route]>([
    ["", ACCUEIL],
    ["#", ACCUEIL],
    ["#/", ACCUEIL],
    ["#/corbeille", ACCUEIL],
    ["#/espaces", ACCUEIL],
    ["#/pages/abc", ACCUEIL],
    ["#page/abc", ACCUEIL],
    [`#/page/${ID}`, { forme: "page", idPage: ID }],
    ["#/page/a%3Ab%20c", { forme: "page", idPage: "a:b c" }],
    ["#/page/%E0%A4%A", { forme: "page-illisible" }],
    ["#/page/", { forme: "page-illisible" }],
  ])("F-002-AC12 lit le fragment « %s »", (fragment, attendue) => {
    expect(lireRoute(fragment)).toEqual(attendue);
  });

  it("F-002-AC11 écrit l'identifiant de la page dans le fragment, encodé", () => {
    expect(fragmentDe({ forme: "page", idPage: ID })).toBe(`#/page/${ID}`);
    expect(fragmentDe({ forme: "page", idPage: "a:b c/d" })).toBe("#/page/a%3Ab%20c%2Fd");
    expect(fragmentDe(ACCUEIL)).toBe("#/");
    expect(fragmentDe({ forme: "page-illisible" })).toBe("#/");
  });

  it("F-002-AC12 relit l'identifiant qu'il a écrit, quel qu'il soit", () => {
    for (const idPage of [ID, "a:b", "é/è?#&=", "100%", " "]) {
      expect(lireRoute(fragmentDe({ forme: "page", idPage }))).toEqual({ forme: "page", idPage });
    }
  });
});
