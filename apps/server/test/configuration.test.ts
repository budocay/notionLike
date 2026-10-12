import { describe, expect, it } from "vitest";

import {
  ErreurConfiguration,
  lireConfiguration,
  MOT_DE_PASSE_FACTICE,
  SECRET_FACTICE,
  type Environnement,
} from "../src/configuration.ts";
import {
  ENV_D_ESSAI,
  ENV_DES_COMPTES_D_ESSAI,
  SECRET_D_ESSAI,
  URL_BASE_D_ESSAI,
  URL_PUBLIQUE_D_ESSAI,
} from "./aides.ts";

// Ce que les variables des comptes d'essai donnent, sans autre réglage.
const COMPTES_PAR_DEFAUT = {
  secretDesSessions: SECRET_D_ESSAI,
  urlPublique: URL_PUBLIQUE_D_ESSAI,
  cookiesSecurises: false,
  proxysDeConfiance: 0,
};

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
  it("F-008-AC12 F-009-AC23 les seules variables obligatoires donnent les valeurs par défaut", () => {
    expect(lireConfiguration({ ...ENV_D_ESSAI })).toEqual({
      hote: "127.0.0.1",
      port: 3000,
      urlBaseDonnees: URL_BASE_D_ESSAI,
      originesAutorisees: [],
      ...COMPTES_PAR_DEFAUT,
    });
  });

  it("F-008-AC12 chaque variable renseignée est rendue, validée", () => {
    const configuration = lireConfiguration({
      NODE_ENV: "test",
      HOTE: "0.0.0.0",
      PORT: "65535",
      URL_BASE_DONNEES: "postgresql://essai@base:5432/essai",
      ORIGINES_AUTORISEES: "https://a.exemple.test,http://localhost:5173",
      ...ENV_DES_COMPTES_D_ESSAI,
    });

    expect(configuration).toEqual({
      hote: "0.0.0.0",
      port: 65535,
      urlBaseDonnees: "postgresql://essai@base:5432/essai",
      originesAutorisees: ["https://a.exemple.test", "http://localhost:5173"],
      ...COMPTES_PAR_DEFAUT,
    });
  });

  it("F-008-AC12 le port 0 est accepté, et une liste d'origines vide donne une liste vide", () => {
    const env = { ...ENV_D_ESSAI, PORT: "0", ORIGINES_AUTORISEES: "" };

    expect(lireConfiguration(env)).toMatchObject({ port: 0, originesAutorisees: [] });
  });

  it("F-008-AC12 la configuration rendue est immuable", () => {
    const configuration = lireConfiguration({ ...ENV_D_ESSAI });

    expect(Object.isFrozen(configuration)).toBe(true);
    expect(Object.isFrozen(configuration.originesAutorisees)).toBe(true);
  });
});

describe("configuration refusée", () => {
  it.each<[string, Environnement, string[]]>([
    ["URL_BASE_DONNEES absente", { ...ENV_DES_COMPTES_D_ESSAI }, ["URL_BASE_DONNEES"]],
    [
      "URL_BASE_DONNEES vide",
      { ...ENV_DES_COMPTES_D_ESSAI, URL_BASE_DONNEES: "" },
      ["URL_BASE_DONNEES"],
    ],
    [
      "URL_BASE_DONNEES qui n'est pas une URL",
      { ...ENV_DES_COMPTES_D_ESSAI, URL_BASE_DONNEES: "valeur-fautive" },
      ["URL_BASE_DONNEES"],
    ],
    [
      "URL_BASE_DONNEES d'un autre protocole",
      { ...ENV_DES_COMPTES_D_ESSAI, URL_BASE_DONNEES: "https://valeur-fautive.test/" },
      ["URL_BASE_DONNEES"],
    ],
    ["PORT non numérique", { ...ENV_D_ESSAI, PORT: "valeur-fautive" }, ["PORT"]],
    ["PORT non entier", { ...ENV_D_ESSAI, PORT: "3000.5" }, ["PORT"]],
    ["PORT négatif", { ...ENV_D_ESSAI, PORT: "-1" }, ["PORT"]],
    ["PORT au-delà de 65535", { ...ENV_D_ESSAI, PORT: "65536" }, ["PORT"]],
    ["PORT vide", { ...ENV_D_ESSAI, PORT: "" }, ["PORT"]],
    ["NODE_ENV inconnu", { ...ENV_D_ESSAI, NODE_ENV: "valeur-fautive" }, ["NODE_ENV"]],
    ["HOTE vide", { ...ENV_D_ESSAI, HOTE: "" }, ["HOTE"]],
    [
      "origine avec un chemin",
      {
        ...ENV_D_ESSAI,
        ORIGINES_AUTORISEES: "https://valeur-fautive.test/chemin",
      },
      ["ORIGINES_AUTORISEES"],
    ],
    [
      "origine qui n'est pas une URL",
      { ...ENV_D_ESSAI, ORIGINES_AUTORISEES: "valeur-fautive" },
      ["ORIGINES_AUTORISEES"],
    ],
    [
      "une origine fautive parmi d'autres",
      {
        ...ENV_D_ESSAI,
        ORIGINES_AUTORISEES: "https://a.exemple.test,valeur-fautive,autre-valeur-fautive",
      },
      ["ORIGINES_AUTORISEES"],
    ],
    [
      "plusieurs variables fautives",
      { NODE_ENV: "valeur-fautive", PORT: "valeur-fautive", ORIGINES_AUTORISEES: "valeur-fautive" },
      [
        "NODE_ENV",
        "PORT",
        "URL_BASE_DONNEES",
        "ORIGINES_AUTORISEES",
        "BETTER_AUTH_SECRET",
        "URL_PUBLIQUE",
      ],
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
      const erreur = refus({ ...ENV_D_ESSAI, ORIGINES_AUTORISEES: origines });

      expect(erreur.variables).toEqual(["ORIGINES_AUTORISEES"]);
    },
  );
});

describe("valeur factice en production", () => {
  it.each([
    ["tel quel", URL_FACTICE],
    ["encodé dans l'URL", URL_FACTICE.replace("factice-a", "factice%2Da")],
  ])("F-008-AC14 en production, le mot de passe factice %s est refusé", (_cas, url) => {
    const erreur = refus({
      ...ENV_DES_COMPTES_D_ESSAI,
      NODE_ENV: "production",
      URL_BASE_DONNEES: url,
    });

    expect(erreur.variables).toEqual(["URL_BASE_DONNEES"]);
    expect(erreur.message).toBe("Configuration invalide : URL_BASE_DONNEES");
  });

  it("F-008-AC14 en production, une autre variable fautive est nommée avec URL_BASE_DONNEES", () => {
    const erreur = refus({
      ...ENV_DES_COMPTES_D_ESSAI,
      NODE_ENV: "production",
      PORT: "abc",
      URL_BASE_DONNEES: URL_FACTICE,
    });

    expect(erreur.variables).toEqual(["PORT", "URL_BASE_DONNEES"]);
  });

  it.each(["development", "test", undefined])(
    "F-008-AC14 hors production (NODE_ENV=%s), le mot de passe factice est accepté",
    (mode) => {
      const env = { ...ENV_DES_COMPTES_D_ESSAI, NODE_ENV: mode, URL_BASE_DONNEES: URL_FACTICE };

      expect(lireConfiguration(env).urlBaseDonnees).toBe(URL_FACTICE);
    },
  );

  it.each([
    URL_BASE_D_ESSAI,
    "postgres://notionlike@base:5432/notionlike",
    "postgres://notionlike:encodage%-illisible@base:5432/notionlike",
    URL_FACTICE.replace(MOT_DE_PASSE_FACTICE, `${MOT_DE_PASSE_FACTICE}-ou-presque`),
  ])("F-008-AC14 en production, un autre mot de passe est accepté (%s)", (url) => {
    const env = { ...ENV_DES_COMPTES_D_ESSAI, NODE_ENV: "production", URL_BASE_DONNEES: url };

    expect(lireConfiguration(env)).toMatchObject({ urlBaseDonnees: url });
  });
});

describe("secret des sessions", () => {
  it.each<[string, Environnement]>([
    ["absent", { URL_BASE_DONNEES: URL_BASE_D_ESSAI, URL_PUBLIQUE: URL_PUBLIQUE_D_ESSAI }],
    ["vide", { ...ENV_D_ESSAI, BETTER_AUTH_SECRET: "" }],
    ["de 31 caractères", { ...ENV_D_ESSAI, BETTER_AUTH_SECRET: "valeur-fautive-".padEnd(31, "x") }],
  ])("F-009-AC18 un secret %s est refusé, nommé sans sa valeur", (_cas, env) => {
    const erreur = refus(env);

    expect(erreur.variables).toEqual(["BETTER_AUTH_SECRET"]);
    expect(erreur.message).toBe("Configuration invalide : BETTER_AUTH_SECRET");
  });

  it("F-009-AC18 un secret de 32 caractères est accepté", () => {
    const secret = "s".repeat(32);

    expect(lireConfiguration({ ...ENV_D_ESSAI, BETTER_AUTH_SECRET: secret })).toMatchObject({
      secretDesSessions: secret,
    });
  });

  it("F-009-AC18 en production, le secret factice du fichier d'exemple est refusé", () => {
    const env = { ...ENV_D_ESSAI, NODE_ENV: "production", BETTER_AUTH_SECRET: SECRET_FACTICE };

    expect(SECRET_FACTICE.length).toBeGreaterThanOrEqual(32);
    expect(refus(env).variables).toEqual(["BETTER_AUTH_SECRET"]);
  });

  it.each(["development", "test", undefined])(
    "F-009-AC18 hors production (NODE_ENV=%s), le secret factice est accepté",
    (mode) => {
      const env = { ...ENV_D_ESSAI, NODE_ENV: mode, BETTER_AUTH_SECRET: SECRET_FACTICE };

      expect(lireConfiguration(env).secretDesSessions).toBe(SECRET_FACTICE);
    },
  );
});

describe("URL publique", () => {
  it.each([
    ["absente", undefined],
    ["vide", ""],
    ["qui n'est pas une URL", "valeur-fautive"],
    ["relative", "//valeur-fautive.test"],
    ["avec un chemin", "https://valeur-fautive.test/chemin"],
    ["avec une barre finale", "https://valeur-fautive.test/"],
    ["d'un autre protocole", "ftp://valeur-fautive.test"],
  ])("F-009-AC30 une URL_PUBLIQUE %s est refusée, nommée sans sa valeur", (_cas, url) => {
    const erreur = refus({ ...ENV_D_ESSAI, URL_PUBLIQUE: url });

    expect(erreur.variables).toEqual(["URL_PUBLIQUE"]);
    expect(erreur.message).toBe("Configuration invalide : URL_PUBLIQUE");
  });

  it.each(["http://127.0.0.1:3000", "https://app.exemple.test"])(
    "F-009-AC30 l'origine %s est acceptée telle quelle",
    (url) => {
      expect(lireConfiguration({ ...ENV_D_ESSAI, URL_PUBLIQUE: url }).urlPublique).toBe(url);
    },
  );
});

describe("cookies sécurisés", () => {
  it.each<[string | undefined, string, boolean]>([
    ["production", "http://app.exemple.test", true],
    ["production", "https://app.exemple.test", true],
    ["development", "https://app.exemple.test", true],
    ["test", "https://app.exemple.test", true],
    [undefined, "https://app.exemple.test", true],
    ["development", "http://app.exemple.test", false],
    ["test", "http://app.exemple.test", false],
    [undefined, "http://app.exemple.test", false],
  ])("F-009-AC9 avec NODE_ENV=%s et URL_PUBLIQUE=%s, le réglage vaut %s", (mode, url, attendu) => {
    const env = { ...ENV_D_ESSAI, NODE_ENV: mode, URL_PUBLIQUE: url };

    expect(lireConfiguration(env).cookiesSecurises).toBe(attendu);
  });
});

describe("proxys de confiance", () => {
  it.each([
    ["0", 0],
    ["2", 2],
  ])("F-009-AC15 PROXYS_DE_CONFIANCE=%s est rendu en nombre", (texte, nombre) => {
    const env = { ...ENV_D_ESSAI, PROXYS_DE_CONFIANCE: texte };

    expect(lireConfiguration(env).proxysDeConfiance).toBe(nombre);
  });

  it.each(["", "-1", "1.5", "un", "1e3", " 1", "9".repeat(400)])(
    "F-009-AC15 PROXYS_DE_CONFIANCE=%j est refusé",
    (texte) => {
      expect(refus({ ...ENV_D_ESSAI, PROXYS_DE_CONFIANCE: texte }).variables).toEqual([
        "PROXYS_DE_CONFIANCE",
      ]);
    },
  );
});
