// `pnpm -w pile demarrer` (F-031-AC4, AC8 à AC11, AC15 à AC19), sans Docker : `docker`, `curl` et
// `lsof` de substitution ; seul AC18 met un vrai processus en écoute, vu par le vrai `lsof`.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { createServer, type Server } from "node:net";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  type Arbre,
  CONTENEURS_EN_MARCHE,
  creerArbre,
  DEPOT,
  ecrire,
  ENV_INFRA,
  ENV_SERVEUR,
  lancer,
  lire,
  MOT_DE_PASSE,
  poserEtat,
  poserLesFichiers,
  poserOutilReel,
  retirerCommande,
  supprimerArbre,
  variables,
  DELAI_D_UN_TEST_MS,
} from "./aides-pile.ts";

vi.setConfig({ testTimeout: DELAI_D_UN_TEST_MS });
import { lireCompose } from "./regles/compose.ts";

const texteDuScript = readFileSync(join(DEPOT, "infra/pile.sh"), "utf8");
const ENTREE = "apps/server/src/verifier-configuration.ts";
const REFUS = [
  "Configuration invalide : URL_BASE_DONNEES, BETTER_AUTH_SECRET",
  "- URL_BASE_DONNEES : valeur factice de l'exemple, refusée en production",
  "- BETTER_AUTH_SECRET : trop courte : 32 caractères au moins",
  "",
].join("\n");
const LANCEMENTS = [" up ", " run ", " build"];

let arbre: Arbre;
let racine: string;

beforeEach(() => {
  arbre = creerArbre();
  racine = realpathSync(arbre.racine);
});

afterEach(() => {
  supprimerArbre(arbre);
});

const appelsDe = (appels: readonly string[], motif: string): string[] =>
  appels.filter((appel) => appel.includes(motif));
const lancements = (appels: readonly string[]): string[] =>
  appels.filter((appel) => LANCEMENTS.some((motif) => appel.includes(motif)));
const rang = (appels: readonly string[], motif: string): number =>
  appels.findIndex((appel) => appel.includes(motif));

// L'environnement que Compose donne au service serveur : apps/server/.env en entier, puis les
// variables d'`environment` d'infra/docker-compose.yml, mot de passe interpolé depuis infra/.env.
function environnementDuService(dans: Arbre): Record<string, string> {
  const compose = lireCompose(readFileSync(join(DEPOT, "infra/docker-compose.yml"), "utf8"));
  const motDePasse = variables(lire(dans, ENV_INFRA)).get("POSTGRES_PASSWORD") ?? "";
  const imposees = Object.entries(compose.services.serveur?.environment ?? {}).map(
    ([cle, valeur]) => [cle, String(valeur).replace(/\$\{POSTGRES_PASSWORD:\?[^}]*\}/, motDePasse)],
  );
  return {
    ...Object.fromEntries(variables(lire(dans, ENV_SERVEUR))),
    ...Object.fromEntries(imposees),
  };
}

function verifier(environnement: Record<string, string>) {
  return spawnSync(process.execPath, [ENTREE], {
    cwd: DEPOT,
    env: environnement,
    encoding: "utf8",
  });
}

describe("couture : fichiers de preparer et code de vérification du serveur", () => {
  it("F-031-AC4 la configuration du service bâtie sur les deux fichiers créés est acceptée en production par l'entrée de vérification", () => {
    expect(lancer(arbre, ["preparer"]).code).toBe(0);
    const environnement = environnementDuService(arbre);

    const resultat = verifier(environnement);

    expect(environnement.NODE_ENV).toBe("production");
    expect(environnement.URL_BASE_DONNEES).toMatch(
      /^postgres:\/\/notionlike:[0-9a-f]{48}@base:5432\/notionlike$/,
    );
    expect(resultat.status).toBe(0);
    expect(resultat.stdout).toBe(
      "URL_PUBLIQUE=http://127.0.0.1:5173\nORIGINES_AUTORISEES=http://127.0.0.1:5173,http://127.0.0.1:5174\n",
    );
    expect(resultat.stderr).toBe("");
  });

  it("F-031-AC4 le même environnement avec le secret factice de l'exemple est refusé : la couture voit un écart", () => {
    expect(lancer(arbre, ["preparer"]).code).toBe(0);
    const exemple = variables(lire(arbre, "apps/server/.env.example"));

    const resultat = verifier({
      ...environnementDuService(arbre),
      BETTER_AUTH_SECRET: exemple.get("BETTER_AUTH_SECRET") ?? "",
    });

    expect(resultat.status).toBe(1);
    expect(resultat.stderr).toMatch(/^Configuration invalide : BETTER_AUTH_SECRET\n/);
  });
});

describe("vérification de la configuration avant tout lancement", () => {
  it("F-031-AC8 lance l'entrée de vérification dans l'image, sans dépendances, sans terminal, la surcharge en dernier", () => {
    poserLesFichiers(arbre);
    ecrire(arbre, "surcharge.yml", "services: {}\n");

    const resultat = lancer(arbre, ["demarrer"], { PILE_SURCHARGE: join(racine, "surcharge.yml") });

    expect(resultat.code).toBe(0);
    expect(appelsDe(resultat.appels, ENTREE)).toEqual([
      `docker compose -p notionlike --env-file ${racine}/infra/.env -f ${racine}/infra/docker-compose.yml` +
        ` -f ${racine}/surcharge.yml -f ${racine}/infra/verification-configuration.yml --progress quiet` +
        ` run --rm --no-deps -T serveur node ${ENTREE}`,
    ]);
    expect(rang(resultat.appels, " build")).toBeLessThan(rang(resultat.appels, ENTREE));
  });

  it("F-031-AC8 la surcharge de vérification retire les volumes et coupe le réseau du service lancé", () => {
    expect(readFileSync(join(DEPOT, "infra/verification-configuration.yml"), "utf8")).toMatch(
      /^services:\n {2}base:\n {4}volumes: !reset \[\]\n {2}serveur:\n {4}network_mode: none\nvolumes: !reset \{\}\n$/m,
    );
  });

  it("F-031-AC8 un refus est relayé depuis sa première ligne, avec le fichier à corriger par variable, sans base démarrée ni volume créé", () => {
    poserLesFichiers(arbre);
    poserEtat(arbre, "verification", "refusee");
    poserEtat(arbre, "refus", `Container notionlike-serveur-run Creating\n${REFUS}`);

    const resultat = lancer(arbre, ["demarrer"]);

    expect(resultat.code).not.toBe(0);
    expect(resultat.erreur).toContain(REFUS);
    expect(resultat.erreur).not.toContain("Container notionlike-serveur-run");
    expect(resultat.erreur).toContain(
      "  - URL_BASE_DONNEES : Compose la bâtit sur POSTGRES_PASSWORD de infra/.env ; corriger ce mot de passe.",
    );
    expect(resultat.erreur).toContain("  - BETTER_AUTH_SECRET : apps/server/.env.");
    expect(appelsDe(resultat.appels, " up ")).toEqual([]);
    expect(existsSync(join(arbre.etat, "volume"))).toBe(false);
  });

  // Écart à la spec consigné dans MEMORY/features/F-031.md : NODE_ENV, HOTE et PORT sont imposées par
  // l'`environment` du service serveur, qui l'emporte sur apps/server/.env ; les y corriger n'y ferait rien.
  it.each(["NODE_ENV", "HOTE", "PORT"])(
    "F-031-AC8 un refus de %s renvoie à infra/docker-compose.yml, pas à apps/server/.env",
    (variable) => {
      poserLesFichiers(arbre);
      poserEtat(arbre, "verification", "refusee");
      poserEtat(
        arbre,
        "refus",
        `Configuration invalide : ${variable}, BETTER_AUTH_SECRET\n- ${variable} : valeur refusée\n`,
      );

      const resultat = lancer(arbre, ["demarrer"]);

      expect(resultat.code).not.toBe(0);
      expect(resultat.erreur).toContain(`  - ${variable} : imposée par infra/docker-compose.yml.`);
      expect(resultat.erreur).not.toContain(`  - ${variable} : apps/server/.env.`);
      expect(resultat.erreur).toContain("  - BETTER_AUTH_SECRET : apps/server/.env.");
      expect(
        lireCompose(readFileSync(join(DEPOT, "infra/docker-compose.yml"), "utf8")).services.serveur
          ?.environment,
      ).toHaveProperty(variable);
    },
  );

  it("F-031-AC8 une Compose qui n'appliquerait pas !reset : le volume apparu pendant la vérification est dit, rien n'est lancé ni supprimé", () => {
    poserLesFichiers(arbre);
    poserEtat(arbre, "run-cree-le-volume");

    const resultat = lancer(arbre, ["demarrer"]);

    expect(resultat.code).not.toBe(0);
    expect(resultat.erreur).toContain(
      "La vérification de la configuration a créé le volume des données notionlike_donnees-base",
    );
    expect(resultat.erreur).toContain("Docker Compose");
    expect(appelsDe(resultat.appels, " up ")).toEqual([]);
    expect(resultat.appels.filter((appel) => /volume (rm|remove)|prune| -v\b/.test(appel))).toEqual(
      [],
    );
    expect(existsSync(join(arbre.etat, "volume"))).toBe(true);
    const inspections = resultat.appels.flatMap((appel, position) =>
      appel.includes("volume inspect") ? [position] : [],
    );
    expect(inspections.at(-2)).toBeLessThan(rang(resultat.appels, ENTREE));
    expect(inspections.at(-1)).toBeGreaterThan(rang(resultat.appels, ENTREE));
  });

  it("F-031-AC8 un volume déjà présent avant la vérification n'est pas pris pour un volume apparu", () => {
    poserLesFichiers(arbre);
    poserEtat(arbre, "run-cree-le-volume");
    poserEtat(arbre, "volume");
    poserEtat(arbre, "mdp-volume", MOT_DE_PASSE);

    const resultat = lancer(arbre, ["demarrer"]);

    expect(resultat.code).toBe(0);
    expect(resultat.erreur).not.toContain("a créé le volume");
  });

  it("F-031-AC8 H3 l'issue proposée met le fichier de côté sous un nom que git ignore", () => {
    poserLesFichiers(arbre);
    poserEtat(arbre, "verification", "refusee");
    poserEtat(arbre, "refus", REFUS);
    const ignores = spawnSync(
      "git",
      ["check-ignore", "apps/server/.env.sauvegarde.local", "infra/.env.sauvegarde.local"],
      { cwd: DEPOT, encoding: "utf8" },
    );

    const resultat = lancer(arbre, ["demarrer"]);

    expect(resultat.erreur).toContain("apps/server/.env.sauvegarde.local");
    expect(ignores.status).toBe(0);
    expect(ignores.stdout.split("\n").filter(Boolean)).toHaveLength(2);
  });

  it("F-031-AC8 une vérification qui n'a pas pu se faire est dite avec son code, sans rien relayer ni lancer", () => {
    poserLesFichiers(arbre);
    poserEtat(arbre, "verification", "autre");

    const resultat = lancer(arbre, ["demarrer"]);

    expect(resultat.code).not.toBe(0);
    expect(resultat.erreur).toContain(
      "La vérification de la configuration n'a pas pu se faire (code 3)",
    );
    expect(resultat.erreur).not.toContain("sortie inattendue");
    expect(appelsDe(resultat.appels, " up ")).toEqual([]);
  });

  it.each([
    ["absent", "PORT_PUBLIE_BASE=5432\n", "absent"],
    ["vide", "POSTGRES_PASSWORD=\n", "vide"],
    ["factice", "POSTGRES_PASSWORD=factice-a-remplacer\n", "valeur factice de l'exemple"],
    ["avec @", "POSTGRES_PASSWORD=abcd@efgh\n", "caractère hors de A-Z a-z 0-9 - . _ ~"],
    ["avec une espace", 'POSTGRES_PASSWORD="abcd efgh"\n', "caractère hors de A-Z a-z 0-9 - . _ ~"],
    ["avec %", "POSTGRES_PASSWORD=abcd%41efgh\n", "caractère hors de A-Z a-z 0-9 - . _ ~"],
  ])(
    "F-031-AC9 mot de passe %s : refus avant tout lancement, la raison sans la valeur",
    (_cas, infra, raison) => {
      poserLesFichiers(arbre, {}, infra);

      const resultat = lancer(arbre, ["demarrer"]);

      expect(resultat.code).not.toBe(0);
      expect(resultat.erreur).toContain(`POSTGRES_PASSWORD de infra/.env refusé : ${raison}`);
      expect(resultat.erreur).not.toMatch(/abcd|efgh/);
      expect(resultat.appels).toEqual(["docker info", "docker compose version --short"]);
    },
  );

  it("F-031-AC9 admet un mot de passe fait de A-Z a-z 0-9 - . _ ~", () => {
    poserLesFichiers(
      arbre,
      { URL_BASE_DONNEES: "postgres://notionlike:Ab-9._~z@127.0.0.1:5432/notionlike" },
      "POSTGRES_PASSWORD=Ab-9._~z\n",
    );

    expect(lancer(arbre, ["demarrer"]).code).toBe(0);
  });

  it.each([
    [
      "localhost seule",
      { ORIGINES_AUTORISEES: "http://localhost:5173", URL_PUBLIQUE: "http://127.0.0.1:3000" },
    ],
    [
      "un autre port",
      { ORIGINES_AUTORISEES: "http://127.0.0.1:5174", URL_PUBLIQUE: "http://127.0.0.1:3000" },
    ],
    ["vides", { ORIGINES_AUTORISEES: "", URL_PUBLIQUE: "http://127.0.0.1:3000" }],
  ])(
    "F-031-AC10 adresse du client absente (%s) : refus avant tout lancement, variable et valeur à ajouter nommées, rappel « pas localhost »",
    (_cas, remplacements) => {
      poserLesFichiers(arbre, remplacements);

      const resultat = lancer(arbre, ["demarrer"]);

      expect(resultat.code).not.toBe(0);
      expect(resultat.erreur).toContain(
        "Ajouter http://127.0.0.1:5173 à ORIGINES_AUTORISEES (origines séparées par des virgules)",
      );
      expect(resultat.erreur).toContain("pas sur localhost");
      expect(appelsDe(resultat.appels, " up ")).toEqual([]);
    },
  );

  it("F-031-AC10 l'adresse du client dans URL_PUBLIQUE seule suffit", () => {
    poserLesFichiers(arbre, { ORIGINES_AUTORISEES: "" });

    expect(lancer(arbre, ["demarrer"]).code).toBe(0);
  });

  it.each([
    [
      "un autre mot de passe",
      `postgres://notionlike:Hy${"x".repeat(10)}@127.0.0.1:5432/notionlike`,
    ],
    ["un autre port", `postgres://notionlike:${MOT_DE_PASSE}@127.0.0.1:5433/notionlike`],
    ["l'hôte localhost", `postgres://notionlike:${MOT_DE_PASSE}@localhost:5432/notionlike`],
  ])(
    "F-031-AC11 URL_BASE_DONNEES du mode hôte avec %s : avertissement sans arrêt, sans aucun mot de passe",
    (_cas, url) => {
      poserLesFichiers(arbre, { URL_BASE_DONNEES: url });

      const resultat = lancer(arbre, ["demarrer"]);

      expect(resultat.code).toBe(0);
      expect(resultat.erreur).toContain("Avertissement : URL_BASE_DONNEES d'apps/server/.env");
      expect(resultat.erreur).toContain("Elle ne sert qu'au mode hôte");
      expect(resultat.erreur).not.toContain("Hyxx");
      expect(resultat.erreur).not.toContain("QzQz");
    },
  );

  it("F-031-AC11 aucun avertissement quand l'URL du mode hôte suit infra/.env", () => {
    poserLesFichiers(arbre);

    expect(lancer(arbre, ["demarrer"]).erreur).not.toContain("Avertissement");
  });
});

describe("démarrage", () => {
  it.each([
    [ENV_SERVEUR, "un dossier"],
    [ENV_SERVEUR, "un lien cassé"],
    [ENV_INFRA, "un dossier"],
    [ENV_INFRA, "un lien cassé"],
  ])(
    "F-031-AC5 %s est %s : demarrer le dit avant la construction de l'image, rien n'est lancé",
    (chemin, forme) => {
      poserLesFichiers(arbre);
      const cible = join(arbre.racine, chemin);
      rmSync(cible);
      if (forme === "un dossier") mkdirSync(cible);
      else symlinkSync(join(arbre.dossier, "absent"), cible);

      const resultat = lancer(arbre, ["demarrer"]);

      expect(resultat.code).not.toBe(0);
      expect(resultat.erreur).toContain(
        `${chemin} n'est pas un fichier lisible (dossier, lien cassé ou droits)`,
      );
      expect(lancements(resultat.appels)).toEqual([]);
    },
  );

  it("F-031-AC15 clone neuf : fichiers créés, vérifications, up -d --wait --build, puis /pret à 200 et les adresses", () => {
    const resultat = lancer(arbre, ["demarrer"]);

    expect(resultat.code).toBe(0);
    expect(existsSync(join(arbre.racine, ENV_INFRA))).toBe(true);
    expect(existsSync(join(arbre.racine, ENV_SERVEUR))).toBe(true);
    const ordre = [
      "docker info",
      "volume inspect",
      " build",
      ENTREE,
      "up -d --wait --build",
      "/pret",
    ];
    const rangs = ordre.map((motif) => rang(resultat.appels, motif));
    expect(rangs.every((valeur) => valeur >= 0)).toBe(true);
    expect([...rangs].sort((a, b) => a - b)).toEqual(rangs);
    expect(appelsDe(resultat.appels, "up -d --wait base")).toEqual([]);
    expect(resultat.sortie).toContain("Serveur : http://127.0.0.1:3000");
    expect(resultat.sortie).toContain("Client : http://127.0.0.1:5173 (pas localhost");
    expect(resultat.sortie).toContain("Lancer le client : pnpm --filter @notionlike/web dev");
    expect(resultat.sortie).toContain("Arrêter la pile : pnpm -w pile arreter");
  });

  it("F-031-AC15 un port publié du serveur réglé est rappelé pour le relais de Vite", () => {
    poserLesFichiers(arbre, {}, `POSTGRES_PASSWORD=${MOT_DE_PASSE}\nPORT_PUBLIE_SERVEUR=3100\n`);

    const resultat = lancer(arbre, ["demarrer"]);

    expect(resultat.code).toBe(0);
    expect(resultat.sortie).toContain("NOTIONLIKE_RELAIS_API=http://127.0.0.1:3100");
    expect(appelsDe(resultat.appels, "/pret")[0]).toContain("http://127.0.0.1:3100/pret");
  });

  it("F-031-AC16 pile déjà en marche : ports de ses propres conteneurs non comptés, code 0, rien d'arrêté ni de supprimé", () => {
    poserLesFichiers(arbre);
    poserEtat(arbre, "conteneurs", CONTENEURS_EN_MARCHE);
    poserEtat(arbre, "volume");
    poserEtat(arbre, "mdp-volume", MOT_DE_PASSE);
    poserEtat(arbre, "ecoute-3000", "com.docke");
    poserEtat(arbre, "ecoute-5432", "com.docke");

    const resultat = lancer(arbre, ["demarrer"]);

    expect(resultat.code).toBe(0);
    expect(appelsDe(resultat.appels, " down")).toEqual([]);
    expect(appelsDe(resultat.appels, " stop ")).toEqual([]);
    expect(appelsDe(resultat.appels, "up -d --wait --build")).toHaveLength(1);
    expect(existsSync(join(arbre.etat, "volume"))).toBe(true);
  });

  it.each([
    [
      "Docker absent du PATH",
      "sans-docker",
      "Docker est absent du PATH : installer Docker Desktop",
    ],
    ["démon arrêté", "sans-demon", "Le démon Docker ne répond pas : démarrer Docker Desktop"],
    [
      "Compose 2.23.9",
      "2.23.9",
      "Docker Compose 2.23.9 : la version 2.24.0 ou plus récente est requise",
    ],
    [
      "Compose v1.29.2",
      "v1.29.2",
      "Docker Compose v1.29.2 : la version 2.24.0 ou plus récente est requise",
    ],
  ])(
    "F-031-AC17 %s : refus avant tout lancement, le manque et l'action nommés",
    (_cas, etat, message) => {
      if (etat === "sans-docker") retirerCommande(arbre, "docker");
      else if (etat === "sans-demon") poserEtat(arbre, "sans-demon");
      else poserEtat(arbre, "version-compose", etat);

      const resultat = lancer(arbre, ["demarrer"]);

      expect(resultat.code).not.toBe(0);
      expect(resultat.erreur).toContain(message);
      expect(lancements(resultat.appels)).toEqual([]);
      expect(existsSync(join(arbre.racine, ENV_INFRA))).toBe(false);
    },
  );

  it.each(["2.24.0", "v2.24.0", "2.40.3-desktop.1", "5.6.0"])(
    "F-031-AC17 Compose %s est admis",
    (version) => {
      poserLesFichiers(arbre);
      poserEtat(arbre, "version-compose", version);

      expect(lancer(arbre, ["demarrer"]).code).toBe(0);
    },
  );
});

async function ecouter(): Promise<{ serveur: Server; port: number }> {
  const serveur = createServer();
  await new Promise<void>((resolve) => serveur.listen(0, "127.0.0.1", resolve));
  const adresse = serveur.address();
  if (adresse === null || typeof adresse === "string") throw new Error("adresse inattendue");
  return { serveur, port: adresse.port };
}

describe("ports déjà pris", () => {
  it("F-031-AC18 un vrai processus en écoute sur le port publié du serveur : refus avant tout lancement, port, processus et issues nommés", async () => {
    const { serveur, port } = await ecouter();
    // Un port libre pour la base : 5432 peut être tenu sur le poste qui lance les tests.
    const libre = await ecouter();
    await new Promise((resolve) => libre.serveur.close(resolve));
    try {
      poserOutilReel(arbre, "lsof");
      poserLesFichiers(
        arbre,
        {},
        `POSTGRES_PASSWORD=${MOT_DE_PASSE}\nPORT_PUBLIE_BASE=${String(libre.port)}\n` +
          `PORT_PUBLIE_SERVEUR=${String(port)}\n`,
      );

      const resultat = lancer(arbre, ["demarrer"]);

      expect(resultat.code).not.toBe(0);
      // Le nom vient du vrai `lsof` : `node` sous macOS, le nom du fil principal (`node-MainThread`)
      // sous Linux. AC18 exige le processus « quand le système le donne », pas un nom normalisé.
      expect(resultat.erreur).toMatch(
        new RegExp(
          `^Le port ${String(port)} \\(PORT_PUBLIE_SERVEUR\\) est déjà en écoute sur le poste, processus : node[^\\s.]*\\.$`,
          "m",
        ),
      );
      expect(resultat.erreur).toContain("Rien n'est lancé. Deux issues :");
      expect(resultat.erreur).toContain(
        "  - arrêter ce processus ; si c'est le serveur lancé en mode hôte",
      );
      expect(resultat.erreur).toContain("mode hôte (pnpm --filter @notionlike/server demarrer)");
      expect(resultat.erreur).toContain(
        "PORT_PUBLIE_SERVEUR=<port> dans infra/.env, et NOTIONLIKE_RELAIS_API",
      );
      expect(lancements(resultat.appels)).toEqual([]);
    } finally {
      serveur.close();
    }
  });

  it("F-031-AC18 le port publié de la base tenu par un autre processus : PORT_PUBLIE_BASE et URL_BASE_DONNEES nommées", () => {
    poserLesFichiers(arbre);
    poserEtat(arbre, "ecoute-5432", "postgres");

    const resultat = lancer(arbre, ["demarrer"]);

    expect(resultat.code).not.toBe(0);
    expect(resultat.erreur).toContain(
      "Le port 5432 (PORT_PUBLIE_BASE) est déjà en écoute sur le poste, processus : postgres.",
    );
    expect(resultat.erreur).toContain(
      "PORT_PUBLIE_BASE=<port> dans infra/.env, et le même port dans URL_BASE_DONNEES",
    );
    expect(lancements(resultat.appels)).toEqual([]);
  });

  it("F-031-AC18 un port publié qui n'est pas un entier de 1 à 65535 est refusé avant tout lancement", () => {
    poserLesFichiers(arbre, {}, `POSTGRES_PASSWORD=${MOT_DE_PASSE}\nPORT_PUBLIE_SERVEUR=70000\n`);

    const resultat = lancer(arbre, ["demarrer"]);

    expect(resultat.code).not.toBe(0);
    expect(resultat.erreur).toContain("PORT_PUBLIE_SERVEUR de infra/.env n'est pas un port");
    expect(lancements(resultat.appels)).toEqual([]);
  });
});

describe("échec du lancement", () => {
  it("F-031-AC19 migration en échec : code non nul, service nommé, fin de son journal, renvoi à la section 3 du retour arrière", () => {
    poserLesFichiers(arbre);
    poserEtat(arbre, "up-en-echec");
    poserEtat(
      arbre,
      "conteneurs",
      "base|running|Up 5 seconds (healthy)|127.0.0.1:5432->5432/tcp\nmigration|exited|Exited (1) 2 seconds ago|\nserveur|created|Created|",
    );

    const resultat = lancer(arbre, ["demarrer"]);

    expect(resultat.code).not.toBe(0);
    expect(resultat.erreur).toContain("service migration (exited|Exited (1) 2 seconds ago)");
    expect(resultat.erreur).toContain("La migration a échoué");
    expect(resultat.erreur).toContain("section 3 d'infra/RETOUR-ARRIERE.md");
    expect(appelsDe(resultat.appels, " logs ")[0]).toMatch(/ logs --no-color --tail 30 migration$/);
  });

  it("F-031-AC19 serveur qui sort : c'est lui qui est nommé", () => {
    poserLesFichiers(arbre);
    poserEtat(arbre, "up-en-echec");
    poserEtat(
      arbre,
      "conteneurs",
      "base|running|Up (healthy)|\nmigration|exited|Exited (0) 9 seconds ago|\nserveur|exited|Exited (4) 1 second ago|",
    );

    const resultat = lancer(arbre, ["demarrer"]);

    expect(resultat.erreur).toContain("service serveur (exited|Exited (4) 1 second ago)");
  });

  it("F-031-AC19 aucun message de la commande de la pile ne cite une suppression de volume", () => {
    expect(texteDuScript).not.toMatch(/down -v|--volumes|volume rm|prune/);
  });
});
