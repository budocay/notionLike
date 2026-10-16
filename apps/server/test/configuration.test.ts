import { describe, expect, it } from "vitest";

import {
  ErreurConfiguration,
  lireConfiguration,
  MOT_DE_PASSE_FACTICE,
  RAISONS,
  RAISONS_DE_REFUS,
  SECRET_FACTICE,
  texteDuRefusDeConfiguration,
  type Environnement,
  type RaisonDeRefus,
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
  it.each<[string, Environnement, string[], RaisonDeRefus[]]>([
    [
      "URL_BASE_DONNEES absente",
      { ...ENV_DES_COMPTES_D_ESSAI },
      ["URL_BASE_DONNEES"],
      [RAISONS.absente],
    ],
    [
      "URL_BASE_DONNEES vide",
      { ...ENV_DES_COMPTES_D_ESSAI, URL_BASE_DONNEES: "" },
      ["URL_BASE_DONNEES"],
      [RAISONS.absente],
    ],
    [
      "URL_BASE_DONNEES qui n'est pas une URL",
      { ...ENV_DES_COMPTES_D_ESSAI, URL_BASE_DONNEES: "valeur-fautive" },
      ["URL_BASE_DONNEES"],
      [RAISONS.urlMalFormee],
    ],
    [
      "URL_BASE_DONNEES d'un autre protocole",
      { ...ENV_DES_COMPTES_D_ESSAI, URL_BASE_DONNEES: "https://valeur-fautive.test/" },
      ["URL_BASE_DONNEES"],
      [RAISONS.protocolePostgres],
    ],
    ["PORT non numérique", { ...ENV_D_ESSAI, PORT: "valeur-fautive" }, ["PORT"], [RAISONS.entier]],
    ["PORT non entier", { ...ENV_D_ESSAI, PORT: "3000.5" }, ["PORT"], [RAISONS.entier]],
    ["PORT négatif", { ...ENV_D_ESSAI, PORT: "-1" }, ["PORT"], [RAISONS.entier]],
    ["PORT au-delà de 65535", { ...ENV_D_ESSAI, PORT: "65536" }, ["PORT"], [RAISONS.horsBornes]],
    ["PORT vide", { ...ENV_D_ESSAI, PORT: "" }, ["PORT"], [RAISONS.absente]],
    [
      "NODE_ENV inconnu",
      { ...ENV_D_ESSAI, NODE_ENV: "valeur-fautive" },
      ["NODE_ENV"],
      [RAISONS.modeInconnu],
    ],
    ["HOTE vide", { ...ENV_D_ESSAI, HOTE: "" }, ["HOTE"], [RAISONS.absente]],
    [
      "origine avec un chemin",
      {
        ...ENV_D_ESSAI,
        ORIGINES_AUTORISEES: "https://valeur-fautive.test/chemin",
      },
      ["ORIGINES_AUTORISEES"],
      [RAISONS.origineNonExacte],
    ],
    [
      "origine qui n'est pas une URL",
      { ...ENV_D_ESSAI, ORIGINES_AUTORISEES: "valeur-fautive" },
      ["ORIGINES_AUTORISEES"],
      [RAISONS.urlMalFormee],
    ],
    [
      "une origine fautive parmi d'autres",
      {
        ...ENV_D_ESSAI,
        ORIGINES_AUTORISEES: "https://a.exemple.test,valeur-fautive,autre-valeur-fautive",
      },
      ["ORIGINES_AUTORISEES"],
      [RAISONS.urlMalFormee],
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
      [
        RAISONS.modeInconnu,
        RAISONS.entier,
        RAISONS.absente,
        RAISONS.urlMalFormee,
        RAISONS.absente,
        RAISONS.absente,
      ],
    ],
  ])(
    "F-008-AC12 F-031-AC12 %s : chaque variable fautive est nommée, avec sa raison, sans sa valeur",
    (_cas, env, variables, raisons) => {
      const erreur = refus(env);

      expect(erreur.variables).toEqual(variables);
      expect(erreur.message).toBe(`Configuration invalide : ${variables.join(", ")}`);
      expect(erreur.message).not.toContain("valeur-fautive");
      expect(erreur.cause).toBeUndefined();
      expect(erreur.raisons).toEqual(
        variables.map((variable, rang) => ({ variable, raison: raisons[rang] })),
      );
      expect(texteDuRefusDeConfiguration(erreur)).not.toContain("valeur-fautive");
    },
  );

  it.each(["*", "https://a.exemple.test,*"])(
    "F-008-AC10 F-031-AC12 le joker est refusé dans ORIGINES_AUTORISEES (%s), qui n'est pas une URL",
    (origines) => {
      const erreur = refus({ ...ENV_D_ESSAI, ORIGINES_AUTORISEES: origines });

      expect(erreur.variables).toEqual(["ORIGINES_AUTORISEES"]);
      expect(erreur.raisons).toEqual([
        { variable: "ORIGINES_AUTORISEES", raison: RAISONS.urlMalFormee },
      ]);
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
    expect(texteDuRefusDeConfiguration(erreur)).toBe(
      `Configuration invalide : URL_BASE_DONNEES\n- URL_BASE_DONNEES : ${RAISONS.factice}\n`,
    );
  });

  it("F-008-AC14 en production, une autre variable fautive est nommée avec URL_BASE_DONNEES", () => {
    const erreur = refus({
      ...ENV_DES_COMPTES_D_ESSAI,
      NODE_ENV: "production",
      PORT: "abc",
      URL_BASE_DONNEES: URL_FACTICE,
    });

    expect(erreur.variables).toEqual(["PORT", "URL_BASE_DONNEES"]);
    expect(erreur.raisons).toEqual([
      { variable: "PORT", raison: RAISONS.entier },
      { variable: "URL_BASE_DONNEES", raison: RAISONS.factice },
    ]);
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
  it.each<[string, Environnement, RaisonDeRefus]>([
    [
      "absent",
      { URL_BASE_DONNEES: URL_BASE_D_ESSAI, URL_PUBLIQUE: URL_PUBLIQUE_D_ESSAI },
      RAISONS.absente,
    ],
    ["vide", { ...ENV_D_ESSAI, BETTER_AUTH_SECRET: "" }, RAISONS.absente],
    [
      "de 31 caractères",
      { ...ENV_D_ESSAI, BETTER_AUTH_SECRET: "valeur-fautive-".padEnd(31, "x") },
      RAISONS.tropCourte,
    ],
  ])("F-009-AC18 F-031-AC12 un secret %s est refusé, nommé sans sa valeur", (_cas, env, raison) => {
    const erreur = refus(env);

    expect(erreur.variables).toEqual(["BETTER_AUTH_SECRET"]);
    expect(erreur.message).toBe("Configuration invalide : BETTER_AUTH_SECRET");
    expect(erreur.raisons).toEqual([{ variable: "BETTER_AUTH_SECRET", raison }]);
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
    expect(refus(env).raisons).toEqual([
      { variable: "BETTER_AUTH_SECRET", raison: RAISONS.factice },
    ]);
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
  it.each<[string, string | undefined, RaisonDeRefus]>([
    ["absente", undefined, RAISONS.absente],
    ["vide", "", RAISONS.absente],
    ["qui n'est pas une URL", "valeur-fautive", RAISONS.urlMalFormee],
    ["relative", "//valeur-fautive.test", RAISONS.urlMalFormee],
    ["avec un chemin", "https://valeur-fautive.test/chemin", RAISONS.origineNonExacte],
    ["avec une barre finale", "https://valeur-fautive.test/", RAISONS.origineNonExacte],
    ["d'un autre protocole", "ftp://valeur-fautive.test", RAISONS.protocolePublic],
  ])(
    "F-009-AC30 F-031-AC12 une URL_PUBLIQUE %s est refusée, nommée sans sa valeur",
    (_cas, url, raison) => {
      const erreur = refus({ ...ENV_D_ESSAI, URL_PUBLIQUE: url });

      expect(erreur.variables).toEqual(["URL_PUBLIQUE"]);
      expect(erreur.message).toBe("Configuration invalide : URL_PUBLIQUE");
      expect(erreur.raisons).toEqual([{ variable: "URL_PUBLIQUE", raison }]);
    },
  );

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
    "F-009-AC15 F-031-AC12 PROXYS_DE_CONFIANCE=%j est refusé",
    (texte) => {
      const erreur = refus({ ...ENV_D_ESSAI, PROXYS_DE_CONFIANCE: texte });

      expect(erreur.variables).toEqual(["PROXYS_DE_CONFIANCE"]);
      expect(erreur.raisons).toEqual([
        {
          variable: "PROXYS_DE_CONFIANCE",
          raison: texte === "" ? RAISONS.absente : RAISONS.entier,
        },
      ]);
    },
  );
});

describe("raisons du refus (F-031-AC12)", () => {
  it("F-031-AC12 la liste des raisons est fermée, dans l'ordre de la spec, qui fixe la priorité", () => {
    expect(RAISONS_DE_REFUS).toEqual([
      "absente",
      "valeur factice de l'exemple, refusée en production",
      "trop courte : 32 caractères au moins",
      "URL mal formée",
      "protocole non pris en charge : postgres ou postgresql attendu",
      "protocole non pris en charge : http ou https attendu",
      "origine non exacte : schéma, hôte et port, sans chemin ni joker",
      "entier attendu",
      "port hors bornes : 65535 au plus",
      "valeur non reconnue : development, test ou production",
    ]);
    expect(Object.values(RAISONS)).toEqual(RAISONS_DE_REFUS);
  });

  // Une ligne par raison de la liste : la variable, la valeur fautive, la raison attendue.
  const PAR_RAISON: readonly [RaisonDeRefus, string, Environnement][] = [
    [RAISONS.absente, "URL_PUBLIQUE", { ...ENV_D_ESSAI, URL_PUBLIQUE: undefined }],
    [
      RAISONS.factice,
      "BETTER_AUTH_SECRET",
      { ...ENV_D_ESSAI, NODE_ENV: "production", BETTER_AUTH_SECRET: SECRET_FACTICE },
    ],
    [RAISONS.tropCourte, "BETTER_AUTH_SECRET", { ...ENV_D_ESSAI, BETTER_AUTH_SECRET: "court" }],
    [RAISONS.urlMalFormee, "URL_BASE_DONNEES", { ...ENV_D_ESSAI, URL_BASE_DONNEES: "pas une url" }],
    [
      RAISONS.protocolePostgres,
      "URL_BASE_DONNEES",
      { ...ENV_D_ESSAI, URL_BASE_DONNEES: "mysql://essai:secret@base:3306/essai" },
    ],
    [RAISONS.protocolePublic, "URL_PUBLIQUE", { ...ENV_D_ESSAI, URL_PUBLIQUE: "ws://app.test" }],
    [
      RAISONS.origineNonExacte,
      "ORIGINES_AUTORISEES",
      { ...ENV_D_ESSAI, ORIGINES_AUTORISEES: "http://127.0.0.1:5173/" },
    ],
    [RAISONS.entier, "PORT", { ...ENV_D_ESSAI, PORT: "trois-mille" }],
    [RAISONS.horsBornes, "PORT", { ...ENV_D_ESSAI, PORT: "70000" }],
    [RAISONS.modeInconnu, "NODE_ENV", { ...ENV_D_ESSAI, NODE_ENV: "prod" }],
  ];

  it("F-031-AC12 chaque raison de la liste est éprouvée par un cas", () => {
    expect(PAR_RAISON.map(([raison]) => raison)).toEqual(RAISONS_DE_REFUS);
  });

  it.each(PAR_RAISON)("F-031-AC12 la raison « %s » est donnée à %s", (raison, variable, env) => {
    const erreur = refus(env);

    expect(erreur.raisons).toEqual([{ variable, raison }]);
    expect(texteDuRefusDeConfiguration(erreur)).toBe(
      `Configuration invalide : ${variable}\n- ${variable} : ${raison}\n`,
    );
  });

  it.each<[string, string, string | undefined, RaisonDeRefus]>([
    ["vide plutôt que mal formée", "URL_BASE_DONNEES", "", RAISONS.absente],
    ["vide plutôt que non entier", "PORT", "", RAISONS.absente],
    ["vide plutôt que trop courte", "BETTER_AUTH_SECRET", "", RAISONS.absente],
    ["vide plutôt que non reconnue", "NODE_ENV", "", RAISONS.absente],
    ["mal formée plutôt que d'un autre protocole", "URL_BASE_DONNEES", "a b", RAISONS.urlMalFormee],
    [
      "mal formée plutôt que non exacte",
      "ORIGINES_AUTORISEES",
      "*,https://a.test/chemin",
      RAISONS.urlMalFormee,
    ],
    [
      "d'un autre protocole plutôt que non exacte",
      "URL_PUBLIQUE",
      "ftp://a.test/chemin",
      RAISONS.protocolePublic,
    ],
    ["non entier plutôt que hors bornes", "PORT", "99999.5", RAISONS.entier],
  ])(
    "F-031-AC12 une variable à plusieurs défauts reçoit la première raison de la liste (%s)",
    (_cas, variable, valeur, raison) => {
      expect(refus({ ...ENV_D_ESSAI, [variable]: valeur }).raisons).toEqual([{ variable, raison }]);
    },
  );

  it("F-031-AC12 le texte du refus : la première ligne inchangée, puis une ligne par variable, dans l'ordre des variables, et un saut de ligne final", () => {
    const erreur = refus({
      NODE_ENV: "production",
      PORT: "70000",
      URL_BASE_DONNEES: URL_FACTICE,
      ORIGINES_AUTORISEES: "http://127.0.0.1:5173/",
      BETTER_AUTH_SECRET: "court",
      URL_PUBLIQUE: "ws://app.test",
    });

    expect(erreur.message).toBe(
      "Configuration invalide : PORT, URL_BASE_DONNEES, ORIGINES_AUTORISEES, BETTER_AUTH_SECRET, URL_PUBLIQUE",
    );
    expect(texteDuRefusDeConfiguration(erreur)).toBe(
      [
        erreur.message,
        `- PORT : ${RAISONS.horsBornes}`,
        `- URL_BASE_DONNEES : ${RAISONS.factice}`,
        `- ORIGINES_AUTORISEES : ${RAISONS.origineNonExacte}`,
        `- BETTER_AUTH_SECRET : ${RAISONS.tropCourte}`,
        `- URL_PUBLIQUE : ${RAISONS.protocolePublic}`,
        "",
      ].join("\n"),
    );
  });

  // Des valeurs hostiles pour chaque variable : chaque refus porte une raison de la liste.
  it.each([
    "NODE_ENV",
    "HOTE",
    "PORT",
    "URL_BASE_DONNEES",
    "ORIGINES_AUTORISEES",
    "BETTER_AUTH_SECRET",
    "URL_PUBLIQUE",
    "PROXYS_DE_CONFIANCE",
  ])("F-031-AC12 tout refus de %s porte une raison de la liste", (variable) => {
    const hostiles = ["", " ", "-1", "1.5", "9".repeat(400), "*", "a,,b", "http://", "x://y", "%"];
    for (const valeur of hostiles) {
      for (const mode of ["production", "development"]) {
        const env = { ...ENV_D_ESSAI, NODE_ENV: mode, [variable]: valeur };
        try {
          lireConfiguration(env);
        } catch (erreur) {
          expect(erreur).toBeInstanceOf(ErreurConfiguration);
          for (const { raison } of (erreur as ErreurConfiguration).raisons) {
            expect(RAISONS_DE_REFUS).toContain(raison);
          }
        }
      }
    }
  });
});

describe("le texte du refus ne dit rien d'une valeur (F-031-AC13)", () => {
  // Des valeurs marquées, de lettres rares, dont aucun segment ne figure par hasard dans le texte.
  const MARQUEES: readonly [RaisonDeRefus, string, string][] = [
    [RAISONS.tropCourte, "BETTER_AUTH_SECRET", "qqqqzzzzkkkkw"],
    [RAISONS.urlMalFormee, "URL_BASE_DONNEES", "qqqqzzzzkkkkw-zq"],
    [RAISONS.urlMalFormee, "URL_PUBLIQUE", "Jx9Qw-kz7Wq"],
    [RAISONS.urlMalFormee, "ORIGINES_AUTORISEES", "Zk7Wq-Jx9Q"],
    [RAISONS.protocolePostgres, "URL_BASE_DONNEES", "qzkwj://Wq7Zk:J9xQv2@kq7zp.zz9:5999/zq"],
    [RAISONS.protocolePublic, "URL_PUBLIQUE", "qzkwj://kq7zp.zz9"],
    [RAISONS.origineNonExacte, "URL_PUBLIQUE", "https://kq7zp.zz9/Wq7Zk"],
    [RAISONS.origineNonExacte, "ORIGINES_AUTORISEES", "https://kq7zp.zz9/Wq7Zk"],
    [RAISONS.entier, "PORT", "Wq7Zk"],
    [RAISONS.entier, "PROXYS_DE_CONFIANCE", "Jx9Qw"],
    [RAISONS.horsBornes, "PORT", "99999"],
    [RAISONS.modeInconnu, "NODE_ENV", "Wq7ZkJ9x"],
  ];

  function segmentsDe(valeur: string): string[] {
    return Array.from({ length: Math.max(valeur.length - 3, 0) }, (_, debut) =>
      valeur.slice(debut, debut + 4),
    );
  }

  function attendreSansFuite(texte: string, valeur: string, excuses: readonly string[] = []): void {
    expect(texte).not.toContain(valeur);
    for (const segment of segmentsDe(valeur).filter((s) => !excuses.some((e) => e.includes(s)))) {
      expect(texte, segment).not.toContain(segment);
    }
    expect(texte).not.toMatch(new RegExp(`(?<!\\d)${String(valeur.length)}(?!\\d)`));
    if (URL.canParse(valeur)) {
      const { protocol, username } = new URL(valeur);
      expect(texte).not.toContain(protocol);
      if (username !== "") {
        expect(texte).not.toContain(username);
      }
    }
  }

  it.each(MARQUEES)(
    "F-031-AC13 la raison « %s » de %s : ni la valeur marquée, ni un segment de quatre caractères, ni sa longueur, ni son protocole ou son utilisateur",
    (raison, variable, valeur) => {
      const erreur = refus({ ...ENV_D_ESSAI, [variable]: valeur });

      expect(erreur.raisons).toEqual([{ variable, raison }]);
      attendreSansFuite(texteDuRefusDeConfiguration(erreur), valeur);
    },
  );

  it("F-031-AC13 toutes les variables fautives à la fois : aucune valeur marquée dans le texte entier", () => {
    const env = {
      NODE_ENV: "Wq7ZkJ9x",
      HOTE: "",
      PORT: "99999",
      URL_BASE_DONNEES: "qzkwj://Wq7Zk:J9xQv2@kq7zp.zz9:5999/zq",
      ORIGINES_AUTORISEES: "Zk7Wq-Jx9Q",
      BETTER_AUTH_SECRET: "qqqqzzzzkkkkw",
      URL_PUBLIQUE: "https://kq7zp.zz9/Wq7Zk",
      PROXYS_DE_CONFIANCE: "Jx9Qw",
    };
    const texte = texteDuRefusDeConfiguration(refus(env));

    expect(texte.split("\n")).toHaveLength(Object.keys(env).length + 2);
    for (const valeur of Object.values(env).filter((v) => v !== "")) {
      attendreSansFuite(texte, valeur);
    }
  });

  // La valeur factice est publique (fichiers d'exemple) et la raison est fixée par la spec : seuls
  // les segments de cette raison (« factice », « empl » de « exemple ») sont admis en commun.
  it("F-031-AC13 une valeur factice : rien d'elle dans le texte hors des segments de la raison fixée par la spec", () => {
    const env = {
      ...ENV_D_ESSAI,
      NODE_ENV: "production",
      URL_BASE_DONNEES: "postgres://Wq7Zk:factice-a-remplacer@kq7zp.zz9:5999/zq",
      BETTER_AUTH_SECRET: SECRET_FACTICE,
    };
    const texte = texteDuRefusDeConfiguration(refus(env));

    expect(texte).toBe(
      [
        "Configuration invalide : URL_BASE_DONNEES, BETTER_AUTH_SECRET",
        `- URL_BASE_DONNEES : ${RAISONS.factice}`,
        `- BETTER_AUTH_SECRET : ${RAISONS.factice}`,
        "",
      ].join("\n"),
    );
    attendreSansFuite(texte, env.URL_BASE_DONNEES, [RAISONS.factice]);
    attendreSansFuite(texte, SECRET_FACTICE, [RAISONS.factice]);
    expect(texte).not.toContain(MOT_DE_PASSE_FACTICE);
  });
});
