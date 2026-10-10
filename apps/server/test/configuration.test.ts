import { describe, expect, it } from "vitest";

import {
  ErreurConfiguration,
  lireConfiguration,
  MOT_DE_PASSE_FACTICE,
  type Environnement,
} from "../src/configuration.ts";
import { URL_BASE_D_ESSAI } from "./aides.ts";

const URL_FACTICE = `postgres://notionlike:${MOT_DE_PASSE_FACTICE}@127.0.0.1:5432/notionlike`;

function refus(env: Environnement): ErreurConfiguration {
  try {
    lireConfiguration(env);
  } catch (erreur) {
    if (erreur instanceof ErreurConfiguration) {
      return erreur;
    }
    throw erreur;
  }
  throw new Error("la configuration a été acceptée");
}

describe("configuration acceptée", () => {
  it("F-008-AC12 la seule variable obligatoire donne les valeurs par défaut", () => {
    expect(lireConfiguration({ URL_BASE_DONNEES: URL_BASE_D_ESSAI })).toEqual({
      hote: "127.0.0.1",
      port: 3000,
      urlBaseDonnees: URL_BASE_D_ESSAI,
      originesAutorisees: [],
    });
  });

  it("F-008-AC12 chaque variable renseignée est rendue, validée", () => {
    const configuration = lireConfiguration({
      NODE_ENV: "test",
      HOTE: "0.0.0.0",
      PORT: "65535",
      URL_BASE_DONNEES: "postgresql://essai@base:5432/essai",
      ORIGINES_AUTORISEES: "https://a.exemple.test,http://localhost:5173",
    });

    expect(configuration).toEqual({
      hote: "0.0.0.0",
      port: 65535,
      urlBaseDonnees: "postgresql://essai@base:5432/essai",
      originesAutorisees: ["https://a.exemple.test", "http://localhost:5173"],
    });
  });

  it("F-008-AC12 le port 0 est accepté, et une liste d'origines vide donne une liste vide", () => {
    const env = { URL_BASE_DONNEES: URL_BASE_D_ESSAI, PORT: "0", ORIGINES_AUTORISEES: "" };

    expect(lireConfiguration(env)).toMatchObject({ port: 0, originesAutorisees: [] });
  });

  it("F-008-AC12 la configuration rendue est immuable", () => {
    const configuration = lireConfiguration({ URL_BASE_DONNEES: URL_BASE_D_ESSAI });

    expect(Object.isFrozen(configuration)).toBe(true);
    expect(Object.isFrozen(configuration.originesAutorisees)).toBe(true);
  });
});

describe("configuration refusée", () => {
  it.each<[string, Environnement, string[]]>([
    ["URL_BASE_DONNEES absente", {}, ["URL_BASE_DONNEES"]],
    ["URL_BASE_DONNEES vide", { URL_BASE_DONNEES: "" }, ["URL_BASE_DONNEES"]],
    [
      "URL_BASE_DONNEES qui n'est pas une URL",
      { URL_BASE_DONNEES: "valeur-fautive" },
      ["URL_BASE_DONNEES"],
    ],
    [
      "URL_BASE_DONNEES d'un autre protocole",
      { URL_BASE_DONNEES: "https://valeur-fautive.test/" },
      ["URL_BASE_DONNEES"],
    ],
    [
      "PORT non numérique",
      { URL_BASE_DONNEES: URL_BASE_D_ESSAI, PORT: "valeur-fautive" },
      ["PORT"],
    ],
    ["PORT non entier", { URL_BASE_DONNEES: URL_BASE_D_ESSAI, PORT: "3000.5" }, ["PORT"]],
    ["PORT négatif", { URL_BASE_DONNEES: URL_BASE_D_ESSAI, PORT: "-1" }, ["PORT"]],
    ["PORT au-delà de 65535", { URL_BASE_DONNEES: URL_BASE_D_ESSAI, PORT: "65536" }, ["PORT"]],
    ["PORT vide", { URL_BASE_DONNEES: URL_BASE_D_ESSAI, PORT: "" }, ["PORT"]],
    [
      "NODE_ENV inconnu",
      { URL_BASE_DONNEES: URL_BASE_D_ESSAI, NODE_ENV: "valeur-fautive" },
      ["NODE_ENV"],
    ],
    ["HOTE vide", { URL_BASE_DONNEES: URL_BASE_D_ESSAI, HOTE: "" }, ["HOTE"]],
    [
      "origine avec un chemin",
      {
        URL_BASE_DONNEES: URL_BASE_D_ESSAI,
        ORIGINES_AUTORISEES: "https://valeur-fautive.test/chemin",
      },
      ["ORIGINES_AUTORISEES"],
    ],
    [
      "origine qui n'est pas une URL",
      { URL_BASE_DONNEES: URL_BASE_D_ESSAI, ORIGINES_AUTORISEES: "valeur-fautive" },
      ["ORIGINES_AUTORISEES"],
    ],
    [
      "une origine fautive parmi d'autres",
      {
        URL_BASE_DONNEES: URL_BASE_D_ESSAI,
        ORIGINES_AUTORISEES: "https://a.exemple.test,valeur-fautive,autre-valeur-fautive",
      },
      ["ORIGINES_AUTORISEES"],
    ],
    [
      "plusieurs variables fautives",
      { NODE_ENV: "valeur-fautive", PORT: "valeur-fautive", ORIGINES_AUTORISEES: "valeur-fautive" },
      ["NODE_ENV", "PORT", "URL_BASE_DONNEES", "ORIGINES_AUTORISEES"],
    ],
  ])(
    "F-008-AC12 %s : chaque variable fautive est nommée, sans sa valeur",
    (_cas, env, variables) => {
      const erreur = refus(env);

      expect(erreur.variables).toEqual(variables);
      expect(erreur.message).toBe(`Configuration invalide : ${variables.join(", ")}`);
      expect(erreur.message).not.toContain("valeur-fautive");
      expect(erreur.cause).toBeUndefined();
    },
  );

  it.each(["*", "https://a.exemple.test,*"])(
    "F-008-AC10 le joker est refusé dans ORIGINES_AUTORISEES (%s)",
    (origines) => {
      const erreur = refus({ URL_BASE_DONNEES: URL_BASE_D_ESSAI, ORIGINES_AUTORISEES: origines });

      expect(erreur.variables).toEqual(["ORIGINES_AUTORISEES"]);
    },
  );
});

describe("valeur factice en production", () => {
  it.each([
    ["tel quel", URL_FACTICE],
    ["encodé dans l'URL", URL_FACTICE.replace("factice-a", "factice%2Da")],
  ])("F-008-AC14 en production, le mot de passe factice %s est refusé", (_cas, url) => {
    const erreur = refus({ NODE_ENV: "production", URL_BASE_DONNEES: url });

    expect(erreur.variables).toEqual(["URL_BASE_DONNEES"]);
    expect(erreur.message).toBe("Configuration invalide : URL_BASE_DONNEES");
  });

  it("F-008-AC14 en production, une autre variable fautive est nommée avec URL_BASE_DONNEES", () => {
    const erreur = refus({ NODE_ENV: "production", PORT: "abc", URL_BASE_DONNEES: URL_FACTICE });

    expect(erreur.variables).toEqual(["PORT", "URL_BASE_DONNEES"]);
  });

  it.each(["development", "test", undefined])(
    "F-008-AC14 hors production (NODE_ENV=%s), le mot de passe factice est accepté",
    (mode) => {
      const env = { NODE_ENV: mode, URL_BASE_DONNEES: URL_FACTICE };

      expect(lireConfiguration(env).urlBaseDonnees).toBe(URL_FACTICE);
    },
  );

  it.each([
    URL_BASE_D_ESSAI,
    "postgres://notionlike@base:5432/notionlike",
    "postgres://notionlike:encodage%-illisible@base:5432/notionlike",
    URL_FACTICE.replace(MOT_DE_PASSE_FACTICE, `${MOT_DE_PASSE_FACTICE}-ou-presque`),
  ])("F-008-AC14 en production, un autre mot de passe est accepté (%s)", (url) => {
    expect(lireConfiguration({ NODE_ENV: "production", URL_BASE_DONNEES: url })).toMatchObject({
      urlBaseDonnees: url,
    });
  });
});
