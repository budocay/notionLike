import { describe, expect, it } from "vitest";

import { fragmentDe, lireRoute, type Route } from "../src/navigation/route.ts";
import { FORMES_REFUSEES, PAGE_P, UUID_AVEC_LETTRES } from "./aides-identifiants.ts";

const ACCUEIL: Route = { forme: "accueil" };
const PAGE_INTROUVABLE: Route = { forme: "page-introuvable" };
const PREFIXE_PAGE = "#/page/";

describe("route", () => {
  it.each(["", "#", "#/", "#/corbeille", "#/espaces", `#/pages/${PAGE_P}`, `#page/${PAGE_P}`])(
    "F-002-AC12 le fragment « %s » désigne l'accueil",
    (fragment) => {
      expect(lireRoute(fragment)).toEqual(ACCUEIL);
    },
  );

  it.each([PAGE_P, UUID_AVEC_LETTRES, crypto.randomUUID()])(
    "F-002-AC12 F-002-AC27 le fragment d'un UUID canonique (%s) désigne cette page",
    (idPage) => {
      expect(lireRoute(`${PREFIXE_PAGE}${idPage}`)).toEqual({ forme: "page", idPage });
    },
  );

  it.each(FORMES_REFUSEES)(
    "F-002-AC27 à la place de l'identifiant de page, un identifiant %s rend la route « page introuvable », qui ne porte rien de la chaîne",
    (_cas, valeur) => {
      const route = lireRoute(`${PREFIXE_PAGE}${valeur}`);

      expect(route).toEqual(PAGE_INTROUVABLE);
      expect(Object.keys(route)).toEqual(["forme"]);
    },
  );

  it("F-002-AC27 le fragment n'est pas décodé : une séquence encodée qui se décoderait en UUID canonique est refusée", () => {
    const encode = `%30${UUID_AVEC_LETTRES.slice(1)}`;

    expect(decodeURIComponent(encode)).toBe(UUID_AVEC_LETTRES);
    expect(lireRoute(`${PREFIXE_PAGE}${encode}`)).toEqual(PAGE_INTROUVABLE);
    expect(lireRoute(`${PREFIXE_PAGE}%E0%A4%A`)).toEqual(PAGE_INTROUVABLE);
  });

  it("F-002-AC27 une route refusée est une constante : aucune chaîne lue n'y survit d'un appel à l'autre", () => {
    const premiere = lireRoute(`${PREFIXE_PAGE}<b>piège</b>`);

    expect(lireRoute(`${PREFIXE_PAGE}${"a".repeat(5_000)}`)).toBe(premiere);
    expect(JSON.stringify(premiere)).toBe('{"forme":"page-introuvable"}');
  });

  it("F-002-AC11 écrit l'identifiant de la page tel quel dans le fragment, et l'accueil pour toute autre route", () => {
    expect(fragmentDe({ forme: "page", idPage: PAGE_P })).toBe(`#/page/${PAGE_P}`);
    expect(fragmentDe(ACCUEIL)).toBe("#/");
    expect(fragmentDe(PAGE_INTROUVABLE)).toBe("#/");
  });

  it("F-002-AC11 F-002-AC12 relit l'identifiant qu'il a écrit", () => {
    const idPage = crypto.randomUUID();

    expect(lireRoute(fragmentDe({ forme: "page", idPage }))).toEqual({ forme: "page", idPage });
  });
});
