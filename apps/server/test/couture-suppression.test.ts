// Couture de F-009-AC33 : tout point du dépôt qui supprime une ligne de session est énuméré ici, à
// partir des sources du dépôt et de celles de better-auth installé (les quatre routes ouvertes, et
// les méthodes de suppression de son adaptateur interne). Chaque point a un scénario qui le fait
// agir et constate qu'un abonné d'essai reçoit le signal ; un point sans scénario fait échouer le
// test, et le scénario doit alors être écrit.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { CHEMINS_COMPTES } from "@notionlike/contrats";
import type { Base, SessionSupprimee } from "@notionlike/db";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  arreterLesServeurs,
  lancerServeur,
  type ServeurDEssai,
  DELAI_D_OUVERTURE_D_UNE_BASE_MS,
} from "./aides.ts";
import {
  corpsUnique,
  deconnecter,
  ecouterLesSuppressions,
  executer,
  fermerLesBases,
  fixerLExpiration,
  inscrire,
  lire,
  ouvrirUneBase,
  sessionDuJeton,
  DELAI_D_UN_CAS_QUI_OUVRE_SA_BASE_MS,
} from "./aides-comptes.ts";
import { sourcesDuDepot } from "./aides-sources.ts";

const DIST_BETTER_AUTH = dirname(fileURLToPath(import.meta.resolve("better-auth")));
// Les routes natives que la liste fermée de F-009-AC17 laisse passer.
const ROUTES_NATIVES = ["/sign-up/email", "/sign-in/email", "/sign-out", "/get-session"];
const METHODES_DE_SUPPRESSION = ["deleteSession", "deleteSessions", "deleteUserSessions"];

type Textes = ReadonlyMap<string, string>;

// Le texte de chaque route native ouverte, du `createAuthEndpoint` qui la déclare au suivant.
function routesNatives(): Map<string, string> {
  const dossier = join(DIST_BETTER_AUTH, "api", "routes");
  const textes = readdirSync(dossier)
    .filter((nom) => nom.endsWith(".mjs"))
    .map((nom) => readFileSync(join(dossier, nom), "utf8"));
  return new Map(
    ROUTES_NATIVES.map((route) => {
      const texte = textes.find((source) => source.includes(`createAuthEndpoint("${route}"`)) ?? "";
      const debut = texte.indexOf(`createAuthEndpoint("${route}"`);
      const fin = texte.indexOf("\nconst ", debut);
      return [route, debut === -1 ? "" : texte.slice(debut, fin === -1 ? undefined : fin)];
    }),
  );
}

// Le corps de chaque méthode de suppression de l'adaptateur interne de better-auth.
function methodesInternes(): Map<string, string> {
  const texte = readFileSync(join(DIST_BETTER_AUTH, "db", "internal-adapter.mjs"), "utf8");
  return new Map(
    METHODES_DE_SUPPRESSION.map((methode) => {
      const debut = texte.indexOf(`\t\t${methode}: async`);
      const fin = texte.indexOf("\n\t\t},", debut);
      return [methode, debut === -1 ? "" : texte.slice(debut, fin)];
    }),
  );
}

function occurrences(texte: string, motif: RegExp): number {
  return [...texte.matchAll(new RegExp(motif.source, "g"))].length;
}

// Les points qui suppriment une ligne de session, avec le nombre d'appels de chacun.
function pointsDeSuppression(depot: Textes, routes: Textes, internes: Textes): string[] {
  const points: string[] = [];
  for (const [chemin, texte] of depot) {
    const requetes = occurrences(texte, /\.delete\(\s*session\b|delete\s+from\s+"?session"?/i);
    const appelsDeLaRequete = occurrences(texte, /(?<!function )\bsupprimerSessions\(/);
    const appelsDeLaFonction = occurrences(
      texte,
      /\bsuppression\.(supprimer|dansUneTransaction)\(/,
    );
    const crochets = occurrences(texte, /session:\s*\{\s*delete:\s*\{\s*before:/);
    for (const [nature, nombre] of [
      ["requête de suppression", requetes],
      ["appel de supprimerSessions", appelsDeLaRequete],
      ["appel de la fonction de suppression", appelsDeLaFonction],
      ["crochet de suppression de better-auth", crochets],
    ] as const) {
      if (nombre > 0) {
        points.push(`${chemin} : ${nature} (${String(nombre)})`);
      }
    }
  }
  for (const [route, texte] of routes) {
    for (const methode of METHODES_DE_SUPPRESSION) {
      const nombre = occurrences(texte, new RegExp(`internalAdapter\\.${methode}\\(`));
      if (nombre > 0) {
        points.push(`better-auth ${route} : ${methode} (${String(nombre)})`);
      }
    }
  }
  // Une méthode de l'adaptateur interne qui supprime sans passer par les crochets échapperait au
  // crochet de `authentification.ts`, donc à la fonction.
  for (const [methode, texte] of internes) {
    if (!/(deleteWithHooks|deleteManyWithHooks|endPreservedSessions)\(/.test(texte)) {
      points.push(`better-auth internalAdapter.${methode} : suppression sans crochet`);
    }
  }
  return points.sort();
}

let base: Base;

beforeAll(async () => {
  base = await ouvrirUneBase();
}, DELAI_D_OUVERTURE_D_UNE_BASE_MS);
afterEach(arreterLesServeurs);
afterAll(fermerLesBases);

interface Constat {
  readonly recus: readonly SessionSupprimee[];
  readonly attendu: SessionSupprimee;
  readonly restante: unknown;
}

interface Contexte {
  readonly serveur: ServeurDEssai;
  readonly cookie: string;
  readonly jeton: string;
  readonly laBase: Base;
}

// Ouvre une session, fait agir le point par le serveur abonné, rend le signal reçu.
async function scenario(
  agir: (contexte: Contexte) => Promise<void>,
  laBase = base,
): Promise<Constat> {
  const serveur = await lancerServeur(laBase);
  const recus = ecouterLesSuppressions(serveur);
  const { cookie, jeton, compte } = await inscrire(serveur, corpsUnique());
  const ligne = await sessionDuJeton(laBase, jeton);
  await agir({ serveur, cookie, jeton, laBase });
  return {
    recus,
    attendu: { idSession: ligne?.id ?? "", idCompte: compte.id },
    restante: await sessionDuJeton(laBase, jeton),
  };
}

async function deconnexion({ serveur, cookie }: Contexte): Promise<void> {
  expect((await deconnecter(serveur, cookie)).status).toBe(200);
}

async function lectureExpiree(chemin: string, contexte: Contexte): Promise<void> {
  await fixerLExpiration(contexte.laBase, contexte.jeton, new Date(Date.now() - 1000));
  expect((await lire(contexte.serveur, chemin, contexte.cookie)).status).not.toBe(500);
}

// Une base dont la première suppression de session est ignorée sans erreur : better-auth annonce
// alors un succès, et la vérification de la déconnexion supprime la session par la fonction.
async function baseQuiIgnoreUneSuppression(): Promise<Base> {
  const laBase = await ouvrirUneBase();
  for (const instruction of [
    `create table essai_saut (n int)`,
    `create function essai_saut() returns trigger language plpgsql as $$
     begin if exists (select 1 from essai_saut) then delete from essai_saut; return null; end if;
     return old; end; $$`,
    `create trigger essai_saut before delete on "session" for each row execute function essai_saut()`,
  ]) {
    await executer(laBase, instruction);
  }
  return laBase;
}

const SCENARIOS: Readonly<Record<string, () => Promise<Constat>>> = {
  "better-auth /sign-out : deleteSession (1)": () => scenario(deconnexion),
  "better-auth /get-session : deleteSession (1)": () =>
    scenario((contexte) => lectureExpiree(CHEMINS_COMPTES.session, contexte)),
  "apps/server/src/authentification.ts : crochet de suppression de better-auth (1)": () =>
    scenario((contexte) => lectureExpiree(CHEMINS_COMPTES.moi, contexte)),
  "apps/server/src/authentification.ts : appel de la fonction de suppression (1)": async () => {
    const laBase = await baseQuiIgnoreUneSuppression();
    return scenario(async (contexte) => {
      await executer(laBase, `insert into essai_saut values (1)`);
      await deconnexion(contexte);
    }, laBase);
  },
  "apps/server/src/sessions.ts : appel de supprimerSessions (1)": () => scenario(deconnexion),
  "packages/db/src/sessions.ts : requête de suppression (1)": () => scenario(deconnexion),
};

describe("points de suppression de session", () => {
  it("F-009-AC33 F-009-AC23 chaque point du dépôt et de better-auth qui supprime une session est énuméré et a son scénario", () => {
    expect(pointsDeSuppression(sourcesDuDepot(), routesNatives(), methodesInternes())).toEqual(
      Object.keys(SCENARIOS).sort(),
    );
    expect([...routesNatives().values()].every((texte) => texte.length > 0)).toBe(true);
    expect([...methodesInternes().values()].every((texte) => texte.length > 0)).toBe(true);
  });

  it.each(Object.keys(SCENARIOS))(
    "F-009-AC33 %s : la session est supprimée par la fonction et l'abonné d'essai reçoit le signal",
    async (point) => {
      const { recus, attendu, restante } = await (
        SCENARIOS[point] ?? (() => Promise.reject(new Error(point)))
      )();

      expect(restante).toBeUndefined();
      expect(recus).toEqual([attendu]);
    },
    // Le scénario du crochet ouvre sa propre base.
    DELAI_D_UN_CAS_QUI_OUVRE_SA_BASE_MS,
  );

  it.each<
    [
      string,
      (
        depot: Map<string, string>,
        routes: Map<string, string>,
        internes: Map<string, string>,
      ) => void,
      string,
    ]
  >([
    [
      "une route ouverte qui se met à supprimer des sessions",
      (_depot, routes) => {
        routes.set(
          "/sign-in/email",
          `${routes.get("/sign-in/email") ?? ""}\nawait ctx.context.internalAdapter.deleteSessions(jetons);`,
        );
      },
      "better-auth /sign-in/email : deleteSessions (1)",
    ],
    [
      "une méthode interne qui supprime sans crochet",
      (_depot, _routes, internes) => {
        internes.set(
          "deleteSession",
          '\t\tdeleteSession: async (token) => { await adapter.delete({ model: "session" }); }',
        );
      },
      "better-auth internalAdapter.deleteSession : suppression sans crochet",
    ],
    [
      "un fichier du serveur qui supprime une session par Drizzle",
      (depot) => {
        depot.set("apps/server/src/purge.ts", "await base.db.delete(session).where(expire);\n");
      },
      "apps/server/src/purge.ts : requête de suppression (1)",
    ],
    [
      "un second appelant de la requête de suppression",
      (depot) => {
        depot.set("apps/server/src/compte.ts", "await supprimerSessions(db, { idCompte });\n");
      },
      "apps/server/src/compte.ts : appel de supprimerSessions (1)",
    ],
    [
      "un second appel de la fonction de suppression",
      (depot) => {
        depot.set("apps/server/src/compte.ts", "await suppression.supprimer({ idCompte });\n");
      },
      "apps/server/src/compte.ts : appel de la fonction de suppression (1)",
    ],
  ])("F-009-AC33 l'énumération voit %s, qui n'a pas de scénario", (_cas, alterer, point) => {
    const depot = sourcesDuDepot();
    const routes = routesNatives();
    const internes = methodesInternes();
    alterer(depot, routes, internes);

    const points = pointsDeSuppression(depot, routes, internes);

    expect(points).toContain(point);
    expect(Object.keys(SCENARIOS)).not.toContain(point);
  });
});
