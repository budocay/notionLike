import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  constatsEnvironnementDuServeur,
  constatsImages,
  constatsMigration,
  constatsMotDePasse,
  constatsOrdreDeDemarrage,
  constatsPorts,
  constatsSanteDeLaBase,
  constatsUrlDeLaBase,
  constatsVolume,
  lireCompose,
} from "./regles/compose.ts";
import {
  constatsIsolement,
  constatsLancement,
  constatsOrdreDesConstats,
  constatsSyntaxe,
} from "./regles/fumee.ts";

const EMPREINTE = "a".repeat(64);
const texteCompose = readFileSync(new URL("../docker-compose.yml", import.meta.url), "utf8");
const texteFumee = readFileSync(new URL("../fumee.sh", import.meta.url), "utf8");
const compose = lireCompose(texteCompose);

describe("mot de passe de la base dans le fichier Compose", () => {
  it("F-008-AC13 le fichier se charge et n'exige le mot de passe que par ${POSTGRES_PASSWORD:?…}, quoté", () => {
    expect(constatsMotDePasse(texteCompose)).toEqual([]);
    expect(constatsUrlDeLaBase(compose)).toEqual([]);
    expect(texteCompose.match(/\$\{POSTGRES_PASSWORD:\?/g)).toHaveLength(2);
  });

  it.each([
    [
      "une valeur par défaut",
      'POSTGRES_PASSWORD: "${POSTGRES_PASSWORD:-notionlike}"',
      "mot de passe lu sans la forme ${POSTGRES_PASSWORD:?message}",
    ],
    [
      "une variable sans message d'exigence",
      'POSTGRES_PASSWORD: "${POSTGRES_PASSWORD}"',
      "mot de passe lu sans la forme ${POSTGRES_PASSWORD:?message}",
    ],
    [
      "une valeur écrite en dur",
      "POSTGRES_PASSWORD: notionlike",
      "POSTGRES_PASSWORD reçoit autre chose que ${POSTGRES_PASSWORD:?message}",
    ],
    [
      "une valeur non quotée",
      "POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?manque}",
      "valeur qui porte le mot de passe non quotée en entier",
    ],
  ])("F-008-AC13 refuse %s", (_cas, ligne, constat) => {
    const fautif = `services:\n  base:\n    environment:\n      ${ligne}\n`;

    expect(constatsMotDePasse(fautif)).toContain(constat);
  });

  it("F-008-AC13 refuse la variable recopiée telle quelle par une liste d'environnement", () => {
    const fautif = "services:\n  base:\n    environment:\n      - POSTGRES_PASSWORD\n";

    expect(constatsMotDePasse(fautif)).toContain(
      "mot de passe lu sans la forme ${POSTGRES_PASSWORD:?message}",
    );
  });

  it("F-008-AC13 un message d'exigence non quoté qui contient « : » rend le fichier illisible", () => {
    const fautif =
      "services:\n  base:\n    environment:\n      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?manque : copier .env}\n";

    expect(() => lireCompose(fautif)).toThrow("Fichier Compose illisible");
  });

  it.each([
    ["un mot de passe en dur", "postgres://notionlike:notionlike@base:5432/notionlike"],
    [
      "une valeur par défaut",
      "postgres://notionlike:${POSTGRES_PASSWORD:-notionlike}@base:5432/notionlike",
    ],
    ["un autre hôte que le service base", "postgres://notionlike:${POSTGRES_PASSWORD:?x}@hote/n"],
  ])("F-008-AC13 refuse une URL de connexion avec %s", (_cas, url) => {
    const bonne = "postgres://notionlike:${POSTGRES_PASSWORD:?x}@base:5432/notionlike";
    const fautif = lireCompose(
      `services:\n  migration:\n    environment:\n      URL_BASE_DONNEES: "${bonne}"\n` +
        `  serveur:\n    environment:\n      URL_BASE_DONNEES: "${url}"\n`,
    );

    expect(constatsUrlDeLaBase(fautif)).toEqual([
      "serveur : URL_BASE_DONNEES n'a pas la forme attendue",
    ]);
  });
});

describe("forme du fichier Compose", () => {
  it("F-008-AC20 l'image PostgreSQL est en 18.6, épinglée par empreinte ; les autres services sont construits", () => {
    expect(constatsImages(compose)).toEqual([]);
    expect(Object.keys(compose.services)).toEqual(["base", "migration", "serveur"]);
  });

  it.each([
    ["postgres:18.6", "sans empreinte"],
    ["postgres:latest", "à l'étiquette latest"],
    [`postgres:latest@sha256:${EMPREINTE}`, "à l'étiquette latest malgré l'empreinte"],
    [`postgres@sha256:${EMPREINTE}`, "sans étiquette"],
    [`postgres:18.6@sha256:${EMPREINTE.slice(1)}`, "à l'empreinte tronquée"],
  ])("F-008-AC20 refuse l'image %s, %s", (image) => {
    const fautif = lireCompose(`services:\n  base:\n    image: ${image}\n`);

    expect(constatsImages(fautif)).toEqual([
      `base : image non épinglée par version et par empreinte : ${image}`,
      "base : image attendue postgres:18.6@sha256:<empreinte>",
    ]);
  });

  it("F-008-AC20 refuse une autre majeure de PostgreSQL et un service sans image ni construction", () => {
    const fautif = lireCompose(
      `services:\n  base:\n    image: postgres:17.9@sha256:${EMPREINTE}\n  serveur:\n    command: ["node"]\n`,
    );

    expect(constatsImages(fautif)).toEqual([
      "serveur : ni image ni construction",
      "base : image attendue postgres:18.6@sha256:<empreinte>",
    ]);
  });

  it("F-008-AC20 la base et le serveur ne sont publiés que sur 127.0.0.1, seul le port du poste étant réglable", () => {
    expect(constatsPorts(compose)).toEqual([]);
    expect(compose.services.base?.ports).toEqual(["127.0.0.1:${PORT_PUBLIE_BASE:-5432}:5432"]);
    expect(compose.services.serveur?.ports).toEqual([
      "127.0.0.1:${PORT_PUBLIE_SERVEUR:-3000}:3000",
    ]);
    expect(compose.services.migration?.ports).toBeUndefined();
  });

  it.each([
    ['"5432:5432"', '"5432:5432"'],
    ['"0.0.0.0:5432:5432"', '"0.0.0.0:5432:5432"'],
    ['"${ADRESSE:-127.0.0.1}:5432:5432"', '"${ADRESSE:-127.0.0.1}:5432:5432"'],
    ['"127.0.0.1:${PORT_PUBLIE_BASE}:5432"', '"127.0.0.1:${PORT_PUBLIE_BASE}:5432"'],
    ["{ target: 5432, published: 5432 }", '{"target":5432,"published":5432}'],
  ])("F-008-AC20 refuse le port publié %s", (port, restitue) => {
    const fautif = lireCompose(`services:\n  base:\n    ports:\n      - ${port}\n`);

    expect(constatsPorts(fautif)).toEqual([
      `base : port publié ailleurs que sur 127.0.0.1 en dur : ${restitue}`,
    ]);
  });

  it("F-008-AC20 refuse un service branché sur le réseau du poste", () => {
    const fautif = lireCompose("services:\n  serveur:\n    network_mode: host\n");

    expect(constatsPorts(fautif)).toEqual(["serveur : network_mode contourne les ports publiés"]);
  });

  it("F-008-AC20 les données de la base sont dans un volume nommé monté sur /var/lib/postgresql", () => {
    expect(constatsVolume(compose)).toEqual([]);
    expect(compose.services.base?.volumes).toEqual(["donnees-base:/var/lib/postgresql"]);
    expect(Object.keys(compose.volumes)).toEqual(["donnees-base"]);
  });

  it.each([
    [
      "l'ancien point de montage",
      "    volumes:\n      - donnees-base:/var/lib/postgresql/data\n",
      "base : données montées sur /var/lib/postgresql/data, attendu /var/lib/postgresql",
    ],
    [
      "un dossier du poste",
      "    volumes:\n      - ./donnees:/var/lib/postgresql\n",
      "base : « ./donnees » n'est pas un volume nommé déclaré",
    ],
    [
      "PGDATA redéfini",
      "    volumes:\n      - donnees-base:/var/lib/postgresql\n    environment:\n      PGDATA: /var/lib/postgresql/data\n",
      "base : PGDATA est redéfini",
    ],
    ["aucun volume", "    image: postgres\n", "base : un seul montage attendu, en forme courte"],
  ])("F-008-AC20 refuse %s", (_cas, base, constat) => {
    const fautif = lireCompose(`services:\n  base:\n${base}volumes:\n  donnees-base:\n`);

    expect(constatsVolume(fautif)).toEqual([constat]);
  });

  it("F-008-AC20 la base est sondée par pg_isready sur son adresse TCP", () => {
    expect(constatsSanteDeLaBase(compose)).toEqual([]);
  });

  it.each([
    [
      "la socket Unix",
      'test: ["CMD-SHELL", "pg_isready -U notionlike -d notionlike"]',
      ["base : le contrôle de santé n'a pas « -h 127.0.0.1 »"],
    ],
    [
      "une autre commande",
      'test: ["CMD", "true"]',
      [
        "base : le contrôle de santé n'a pas « pg_isready »",
        "base : le contrôle de santé n'a pas « -h 127.0.0.1 »",
        "base : le contrôle de santé n'a pas « -U notionlike »",
        "base : le contrôle de santé n'a pas « -d notionlike »",
      ],
    ],
    [
      "un contrôle désactivé",
      'disable: true\n      test: "pg_isready -h 127.0.0.1 -U notionlike -d notionlike"',
      ["base : le contrôle de santé est désactivé"],
    ],
  ])("F-008-AC20 refuse un contrôle de santé de la base par %s", (_cas, controle, constats) => {
    const fautif = lireCompose(`services:\n  base:\n    healthcheck:\n      ${controle}\n`);

    expect(constatsSanteDeLaBase(fautif)).toEqual(constats);
  });
});

describe("ordre de démarrage", () => {
  it("F-008-AC19 le serveur attend la base saine et la migration réussie, la migration attend la base saine", () => {
    expect(constatsOrdreDeDemarrage(compose)).toEqual([]);
  });

  it("F-008-AC19 refuse des dépendances en forme courte, qui n'attendent ni la santé ni la fin", () => {
    const fautif = lireCompose(
      "services:\n  migration:\n    depends_on: [base]\n  serveur:\n    depends_on: [base, migration]\n",
    );

    expect(constatsOrdreDeDemarrage(fautif)).toEqual([
      "migration : n'attend pas base (service_healthy)",
      "serveur : n'attend pas base (service_healthy)",
      "serveur : n'attend pas migration (service_completed_successfully)",
    ]);
  });

  it.each([
    ["attend seulement son démarrage", "condition: service_started"],
    ["la rend facultative", "condition: service_completed_successfully\n        required: false"],
  ])("F-008-AC21 refuse un serveur qui %s de la migration", (_cas, dependance) => {
    const fautif = lireCompose(
      "services:\n  migration:\n    depends_on:\n      base:\n        condition: service_healthy\n" +
        "  serveur:\n    depends_on:\n      base:\n        condition: service_healthy\n" +
        `      migration:\n        ${dependance}\n`,
    );

    expect(constatsOrdreDeDemarrage(fautif)).toEqual([
      "serveur : n'attend pas migration (service_completed_successfully)",
    ]);
  });

  it("F-008-AC21 la migration s'exécute une fois, dans l'image du serveur, avec la seule URL de la base", () => {
    expect(constatsMigration(compose)).toEqual([]);
    expect(compose.services.serveur?.build).toEqual({
      context: "..",
      dockerfile: "infra/Dockerfile",
    });
  });

  it.each([
    ["relancée après un échec", "restart: on-failure", "migration : politique de redémarrage"],
    [
      "lancée par une autre commande",
      'command: ["node", "apps/server/src/main.ts"]',
      "migration : commande inattendue",
    ],
    [
      "construite autrement que le serveur",
      "build: { context: .., dockerfile: infra/Dockerfile.migration }",
      "migration : construction différente de celle du serveur",
    ],
    [
      "dotée d'une variable de plus",
      "environment: { URL_BASE_DONNEES: x, NODE_ENV: development }",
      "migration : reçoit autre chose que URL_BASE_DONNEES",
    ],
  ])("F-008-AC21 refuse une migration %s", (_cas, ligne, constat) => {
    const conforme = {
      build: "build: { context: .., dockerfile: infra/Dockerfile }",
      command: 'command: ["node", "packages/db/src/migrer.ts"]',
      environment: "environment: { URL_BASE_DONNEES: x }",
    };
    const cle = ligne.split(":")[0] ?? "";
    const lignes = Object.values({ ...conforme, [cle]: ligne }).join("\n    ");
    const fautif = lireCompose(
      `services:\n  migration:\n    ${lignes}\n  serveur:\n    ${conforme.build}\n`,
    );

    expect(constatsMigration(fautif)).toEqual([constat]);
  });
});

describe("environnement du serveur", () => {
  it("F-008-AC24 le serveur reçoit apps/server/.env en entier, obligatoire, et Compose ne fixe que trois variables", () => {
    expect(constatsEnvironnementDuServeur(compose)).toEqual([]);
    expect(compose.services.serveur?.env_file).toEqual([
      { path: "../apps/server/.env", required: true },
    ]);
    expect(compose.services.serveur?.environment).toMatchObject({ HOTE: "0.0.0.0", PORT: "3000" });
  });

  it.each([
    ["facultatif", "env_file:\n      - path: ../apps/server/.env\n        required: false"],
    ["absent", "image: x"],
    ["remplacé par un autre", "env_file: ../.env"],
    ["doublé d'un second", "env_file: [../apps/server/.env, ./serveur.env]"],
  ])("F-008-AC24 refuse un fichier d'environnement %s", (_cas, fichier) => {
    const fautif = lireCompose(
      `services:\n  serveur:\n    ${fichier}\n    environment: { HOTE: h, PORT: p, URL_BASE_DONNEES: u }\n`,
    );

    expect(constatsEnvironnementDuServeur(fautif)).toEqual([
      "serveur : env_file n'est pas le seul fichier ../apps/server/.env, obligatoire",
    ]);
  });

  it("F-008-AC24 refuse une variable du serveur recopiée dans le fichier Compose", () => {
    const fautif = lireCompose(
      "services:\n  serveur:\n    env_file: ../apps/server/.env\n" +
        "    environment: { HOTE: h, PORT: p, URL_BASE_DONNEES: u, ORIGINES_AUTORISEES: o }\n",
    );

    expect(constatsEnvironnementDuServeur(fautif)).toEqual([
      "serveur : variables recopiées une à une au lieu du fichier entier",
    ]);
  });
});

describe("script de fumée", () => {
  it("F-008-AC19 infra/fumee.sh annonce les constats 1 à 11 de l'ADR-0006 dans l'ordre", () => {
    expect(constatsOrdreDesConstats(texteFumee)).toEqual([]);
  });

  it("F-008-AC19 refuse un script dont un constat manque ou vient avant son tour", () => {
    const fautif = 'constat 1 "pile"\nconstat 3 "version"\nconstat 2 "migration"\n';

    expect(constatsOrdreDesConstats(fautif)).toEqual([
      "constats annoncés : 1, 3, 2 ; attendus : 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11",
    ]);
  });

  it("F-008-AC19 infra/fumee.sh lance la pile par up -d --wait, sous un projet et des ports à part", () => {
    expect(compose.projet).toBe("notionlike");
    expect(constatsLancement(texteFumee)).toEqual([]);
    expect(constatsIsolement(texteFumee, compose.projet)).toEqual([]);
  });

  it("F-008-AC19 refuse un lancement par --abort-on-container-exit, même cité à côté d'un commentaire", () => {
    const fautif =
      "# up -d --wait\ndocker compose up --abort-on-container-exit # arrête tout dès que la migration finit\n";

    expect(constatsLancement(fautif)).toEqual([
      "la pile n'est pas lancée par up -d --wait",
      "--abort-on-container-exit arrête la pile dès que la migration finit",
    ]);
  });

  it("F-008-AC19 refuse un script qui prendrait le projet ou les ports de la pile de travail", () => {
    const fautif = 'PROJET="notionlike"\nexport PORT_PUBLIE_BASE=5432\n';

    expect(constatsIsolement(fautif, "notionlike")).toEqual([
      "le projet de fumée n'a pas un nom distinct de la pile de travail",
      "PORT_PUBLIE_BASE n'est pas un port distinct de ceux de la pile de travail",
      "PORT_PUBLIE_SERVEUR n'est pas un port distinct de ceux de la pile de travail",
    ]);
  });

  it("F-008-AC19 infra/fumee.sh se lit sans erreur de syntaxe, et une erreur de syntaxe est vue", () => {
    expect(constatsSyntaxe(texteFumee)).toEqual([]);
    expect(constatsSyntaxe("if true; then\n  echo sans fin\n")).toHaveLength(1);
  });
});
