import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  constatsCommande,
  constatsContexte,
  constatsCopies,
  constatsGestionnaire,
  constatsImagesDeBase,
  constatsModeDeProduction,
  constatsRetraitDeNpm,
  constatsSanteDuServeur,
  constatsSecrets,
  constatsUtilisateur,
  lireInstructions,
} from "./regles/dockerfile.ts";

const racine = new URL("../../", import.meta.url);
const lire = (chemin: string): string => readFileSync(new URL(chemin, racine), "utf8");

const dockerfile = lireInstructions(lire("infra/Dockerfile"));
const contexte = lire(".dockerignore");
const manifeste: unknown = JSON.parse(lire("package.json"));
const gestionnaire = (manifeste as { packageManager: string }).packageManager;
const versionDePnpm = gestionnaire.replace(/^pnpm@/, "");

const EMPREINTE = "a".repeat(64);
const AUTRE_EMPREINTE = "b".repeat(64);
const IMAGE = `node:26.11.1-alpine3.24@sha256:${EMPREINTE}`;

/** Dockerfile fautif sur chaque exigence : étiquette latest, root, secret en ENV, npm gardé. */
const DOCKERFILE_FAUTIF = lireInstructions(`
# FROM ${IMAGE}
FROM node:latest AS dependances
RUN corepack enable && corepack prepare pnpm@9.0.0
COPY . .
FROM node:26-alpine
ARG JETON_NPM
ENV NODE_ENV=development \\
    POSTGRES_PASSWORD=notionlike
COPY apps/server/.env apps/server/.env
RUN npm install --omit=dev
USER node
USER root
HEALTHCHECK NONE
CMD node apps/server/src/main.ts
`);

describe("image du serveur", () => {
  it("F-008-AC20 chaque étape part de la même image Node 26 Alpine, épinglée par étiquette complète et empreinte", () => {
    expect(constatsImagesDeBase(dockerfile)).toEqual([]);
    expect(dockerfile.filter(({ nom }) => nom === "FROM")).toHaveLength(2);
  });

  it("F-008-AC20 refuse l'étiquette latest, l'étiquette sans variante complète et deux images différentes", () => {
    expect(constatsImagesDeBase(DOCKERFILE_FAUTIF)).toEqual([
      "FROM node:latest : attendu node:26.<m>.<c>-alpine3.<v>@sha256:<empreinte>",
      "FROM node:26-alpine : attendu node:26.<m>.<c>-alpine3.<v>@sha256:<empreinte>",
      "les étapes ne partent pas de la même image",
    ]);
  });

  it.each([
    [`node:26.11.1-alpine3.24`, "sans empreinte"],
    [`node:26.11.1-slim@sha256:${EMPREINTE}`, "en variante slim"],
    [`node:26.11.1-alpine@sha256:${EMPREINTE}`, "sans la version d'Alpine"],
    [`node:24.9.0-alpine3.24@sha256:${EMPREINTE}`, "d'une autre majeure"],
    ["dependances", "reprise d'une étape précédente"],
  ])("F-008-AC20 refuse l'image de base %s, %s", (image) => {
    const fautif = lireInstructions(`FROM ${image} AS execution\n`);

    expect(constatsImagesDeBase(fautif)).toEqual([
      `FROM ${image} : attendu node:26.<m>.<c>-alpine3.<v>@sha256:<empreinte>`,
    ]);
  });

  it("F-008-AC20 refuse deux étapes épinglées sur deux empreintes, et un fichier sans FROM", () => {
    const fautif = lireInstructions(
      `FROM ${IMAGE} AS a\nFROM --platform=linux/arm64 node:26.11.1-alpine3.24@sha256:${AUTRE_EMPREINTE}\n`,
    );

    expect(constatsImagesDeBase(fautif)).toEqual(["les étapes ne partent pas de la même image"]);
    expect(constatsImagesDeBase(lireInstructions("# FROM node\n"))).toEqual([
      "aucune instruction FROM",
    ]);
  });

  it("F-008-AC20 pnpm est installé par npm à la version du champ packageManager, sans corepack", () => {
    expect(gestionnaire).toMatch(/^pnpm@\d+\.\d+\.\d+$/);
    expect(constatsGestionnaire(dockerfile, versionDePnpm)).toEqual([]);
  });

  it("F-008-AC20 refuse corepack, une autre version de pnpm et une version non fixée", () => {
    expect(constatsGestionnaire(DOCKERFILE_FAUTIF, "12.10.1")).toEqual([
      "pnpm installé en «  », attendu 12.10.1",
      "corepack est absent de l'image de base",
    ]);
    expect(
      constatsGestionnaire(lireInstructions("RUN npm install -g pnpm@12.9.0\n"), "12.10.1"),
    ).toEqual(["pnpm installé en « 12.9.0 », attendu 12.10.1"]);
    expect(
      constatsGestionnaire(lireInstructions("RUN npm install -g pnpm@latest\n"), "12.10.1"),
    ).toEqual(["pnpm installé en « latest », attendu 12.10.1"]);
  });

  it("F-008-AC20 l'étape finale retire npm et npx, et n'installe rien", () => {
    expect(constatsRetraitDeNpm(dockerfile)).toEqual([]);
  });

  it("F-008-AC20 refuse une image finale qui garde npm, ou qui ne le retire que dans l'étape de dépendances", () => {
    expect(constatsRetraitDeNpm(DOCKERFILE_FAUTIF)).toEqual([
      "l'étape finale ne retire pas /usr/local/lib/node_modules/npm",
      "l'étape finale ne retire pas /usr/local/bin/npm",
      "l'étape finale ne retire pas /usr/local/bin/npx",
      "l'étape finale installe des paquets",
    ]);
    const retraitTropTot = lireInstructions(
      `FROM ${IMAGE} AS a\nRUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx\n` +
        `FROM ${IMAGE}\nRUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm\n`,
    );
    expect(constatsRetraitDeNpm(retraitTropTot)).toEqual([
      "l'étape finale ne retire pas /usr/local/bin/npx",
    ]);
  });

  it("F-008-AC20 le serveur s'exécute sous l'utilisateur node, posé par le dernier USER", () => {
    expect(constatsUtilisateur(dockerfile)).toEqual([]);
  });

  it("F-008-AC20 refuse une image qui finit en root, par un USER root ou faute de USER", () => {
    expect(constatsUtilisateur(DOCKERFILE_FAUTIF)).toEqual([
      "dernier USER égal à « root », attendu node",
    ]);
    expect(constatsUtilisateur(lireInstructions(`FROM ${IMAGE}\nUSER 0\n`))).toEqual([
      "dernier USER égal à « 0 », attendu node",
    ]);
    const sansUtilisateur = lireInstructions(`FROM ${IMAGE} AS a\nUSER node\nFROM ${IMAGE}\n`);
    expect(constatsUtilisateur(sansUtilisateur)).toEqual([
      "aucun USER dans l'étape finale : l'image tourne en root",
    ]);
  });

  it("F-008-AC20 l'image porte un contrôle de santé du serveur sur GET /sante", () => {
    expect(constatsSanteDuServeur(dockerfile)).toEqual([]);
  });

  it("F-008-AC20 refuse une image sans contrôle de santé, ou au contrôle désactivé", () => {
    expect(constatsSanteDuServeur(DOCKERFILE_FAUTIF)).toEqual([
      "le HEALTHCHECK n'interroge pas /sante",
    ]);
    expect(constatsSanteDuServeur(lireInstructions(`FROM ${IMAGE}\nUSER node\n`))).toEqual([
      "aucun HEALTHCHECK dans l'étape finale",
    ]);
  });

  it("F-008-AC19 le serveur est lancé en forme tableau, sans shell entre Docker et Node", () => {
    expect(constatsCommande(dockerfile)).toEqual([]);
  });

  it("F-008-AC19 refuse une commande en forme shell, une autre commande et l'absence de CMD", () => {
    const constat = ['CMD attendu en forme tableau : ["node","apps/server/src/main.ts"]'];

    expect(constatsCommande(DOCKERFILE_FAUTIF)).toEqual(constat);
    expect(
      constatsCommande(lireInstructions('CMD ["node", "packages/db/src/migrer.ts"]\n')),
    ).toEqual(constat);
    expect(constatsCommande(lireInstructions(`FROM ${IMAGE}\n`))).toEqual(constat);
  });

  it("F-008-AC14 l'image fixe NODE_ENV=production", () => {
    expect(constatsModeDeProduction(dockerfile)).toEqual([]);
  });

  it("F-008-AC14 refuse une image en mode développement", () => {
    expect(constatsModeDeProduction(DOCKERFILE_FAUTIF)).toEqual([
      "ENV NODE_ENV=production attendu",
    ]);
  });

  it("F-008-AC13 le Dockerfile ne porte aucun secret et ne copie aucun fichier .env", () => {
    expect(constatsSecrets(dockerfile)).toEqual([]);
  });

  it("F-008-AC13 refuse un secret en ENV ou en ARG et la copie d'un fichier .env", () => {
    expect(constatsSecrets(DOCKERFILE_FAUTIF)).toEqual([
      "ARG porte un secret",
      "ENV porte un secret",
      "COPY copie un fichier .env",
    ]);
  });
});

describe("contexte de construction", () => {
  it("F-008-AC20 .dockerignore commence par * et n'admet que des exceptions, sans .env, test ni node_modules", () => {
    expect(constatsContexte(contexte)).toEqual([]);
  });

  it("F-008-AC13 refuse un contexte ouvert, ou qui laisse entrer un fichier .env ou des tests", () => {
    expect(constatsContexte("node_modules\n.env\n")).toEqual([
      ".dockerignore ne commence pas par *",
      "« .env » n'est pas une exception",
      "« .env » fait entrer un fichier interdit dans le contexte",
    ]);
    expect(constatsContexte("# liste blanche\n*\n!apps/server/.env\n!apps/server/test\n")).toEqual([
      "« !apps/server/.env » fait entrer un fichier interdit dans le contexte",
      "« !apps/server/test » fait entrer un fichier interdit dans le contexte",
    ]);
  });

  it("F-008-AC20 tout ce que le Dockerfile copie du contexte est dans la liste blanche", () => {
    expect(constatsCopies(dockerfile, contexte)).toEqual([]);
  });

  it("F-008-AC20 refuse une copie que la liste blanche exclut, et laisse passer une copie entre étapes", () => {
    const copies = lireInstructions(
      "COPY --from=dependances /app/node_modules node_modules\n" +
        "COPY apps/server/src/ apps/server/src\nCOPY package.json apps/web/package.json ./\n",
    );

    expect(constatsCopies(copies, "*\n!package.json\n!apps/server/src\n")).toEqual([
      "COPY apps/web/package.json : absent de la liste blanche de .dockerignore",
    ]);
    expect(constatsCopies(DOCKERFILE_FAUTIF, "*\n!package.json\n")).toEqual([
      "COPY . : absent de la liste blanche de .dockerignore",
      "COPY apps/server/.env : absent de la liste blanche de .dockerignore",
    ]);
  });
});
