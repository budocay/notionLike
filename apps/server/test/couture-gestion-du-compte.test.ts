// Coutures de F-027 (AC20) : la liste fermée de F-009-AC17 reste fermée aux routes natives de
// better-auth qui changent un mot de passe, modifient un compte, listent ou révoquent des sessions ;
// les quatre routes d'authentification gardent leur comportement ; tout point du dépôt qui écrit le
// nom ou le mot de passe d'un compte est énuméré et a son scénario (ceux qui suppriment une session
// le sont par `couture-suppression.test.ts`) ; les cinq routes sont protégées (F-011-AC8). Avis par
// courriel (AC8) : F-026 n'est pas livrée, rien n'est envoyé.
import { readFileSync } from "node:fs";

import {
  CHEMINS_COMPTES,
  ROUTES_DU_COMPTE,
  ROUTES_PUBLIQUES,
  schemaCompte,
  type RouteApi,
} from "@notionlike/contrats";
import type { Base } from "@notionlike/db";
import type { Express } from "express";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

import {
  arreterLesServeurs,
  DELAI_D_OUVERTURE_D_UNE_BASE_MS,
  lancerServeur,
  type ServeurDEssai,
} from "./aides.ts";
import {
  connecter,
  corpsUnique,
  DELAI_DES_COMPTES_MS,
  deconnecter,
  fermerLesBases,
  inscrire,
  lignesDe,
  lire,
  ouvrirUneBase,
} from "./aides-comptes.ts";
import { appeler, corpsDe, erreurDe } from "./aides-espaces.ts";
import {
  changerLeMotDePasse,
  changerLeNom,
  creerUnTitulaire,
  empreinteDuCompte,
} from "./aides-gestion-du-compte.ts";
import { sourcesDuDepot } from "./aides-sources.ts";

const DELAI_MS = 30_000;

// Les routes natives de better-auth 1.7.7 qui changent un mot de passe, modifient un compte,
// listent ou révoquent des sessions (MEMORY/VEILLE.md, lot A), et `POST /get-session`.
const ROUTES_NATIVES_FERMEES: readonly (readonly [string, string])[] = [
  ["POST", "/api/auth/change-password"],
  ["POST", "/api/auth/update-user"],
  ["POST", "/api/auth/change-email"],
  ["POST", "/api/auth/delete-user"],
  ["POST", "/api/auth/verify-password"],
  ["GET", "/api/auth/list-sessions"],
  ["POST", "/api/auth/revoke-session"],
  ["POST", "/api/auth/revoke-sessions"],
  ["POST", "/api/auth/revoke-other-sessions"],
  ["POST", "/api/auth/update-session"],
  ["POST", "/api/auth/get-session"],
  ["GET", "/api/auth/list-accounts"],
];

let base: Base;
let serveur: ServeurDEssai;

beforeAll(async () => {
  base = await ouvrirUneBase();
}, DELAI_D_OUVERTURE_D_UNE_BASE_MS);
afterEach(arreterLesServeurs);
afterAll(fermerLesBases);

function occurrences(texte: string, motif: RegExp): number {
  return [...texte.matchAll(new RegExp(motif.source, `${motif.flags.replace("g", "")}g`))].length;
}

// Les points du dépôt qui écrivent le nom ou le mot de passe d'un compte : une requête d'écriture
// sur `user` ou `account` (Drizzle ou SQL), ou un appel des deux requêtes de `packages/db` qui le
// font. L'inscription de better-auth crée le compte : elle est hors du dépôt, et ses quatre routes
// sont gardées par `couture-espaces.test.ts` et par ce fichier.
function pointsDEcritureDuCompte(depot: ReadonlyMap<string, string>): string[] {
  const points: string[] = [];
  for (const [chemin, texte] of depot) {
    for (const [nature, motif] of [
      [
        "requête d'écriture du compte",
        /\.update\(\s*(user|account)\b|update\s+"?(user|account)"?\s+set/i,
      ],
      ["appel de renommerCompte", /(?<!function )\brenommerCompte\(/],
      ["appel de ecrireEmpreinte", /(?<!function )\becrireEmpreinte\(/],
    ] as const) {
      const nombre = occurrences(texte, motif);
      if (nombre > 0) {
        points.push(`${chemin} : ${nature} (${String(nombre)})`);
      }
    }
  }
  return points.sort();
}

const SCENARIOS_D_ECRITURE: Readonly<Record<string, () => Promise<void>>> = {
  "packages/db/src/gestion-du-compte.ts : requête d'écriture du compte (2)": async () => {
    await scenarioDuNom();
    await scenarioDuMotDePasse();
  },
  "apps/server/src/gestion-du-compte.ts : appel de renommerCompte (1)": scenarioDuNom,
  "apps/server/src/gestion-du-compte.ts : appel de ecrireEmpreinte (1)": scenarioDuMotDePasse,
};

async function scenarioDuNom(): Promise<void> {
  serveur = await lancerServeur(base);
  const titulaire = await creerUnTitulaire(base);
  await corpsDe(
    await changerLeNom(serveur, titulaire.cookie, { nom: "Couture" }),
    200,
    schemaCompte,
  );
  const ligne = (await lignesDe(base, "user")).find(({ id }) => id === titulaire.id);
  expect(ligne?.name).toBe("Couture");
}

async function scenarioDuMotDePasse(): Promise<void> {
  serveur = await lancerServeur(base);
  const titulaire = await creerUnTitulaire(base);
  const avant = await empreinteDuCompte(base, titulaire.id);
  expect((await changerLeMotDePasse(serveur, titulaire.cookie)).status).toBe(204);
  expect(await empreinteDuCompte(base, titulaire.id)).not.toBe(avant);
}

describe("écritures du nom et du mot de passe (F-027-AC20)", () => {
  it("F-027-AC20 chaque point du dépôt qui écrit le nom ou le mot de passe d'un compte est énuméré et a son scénario", () => {
    expect(pointsDEcritureDuCompte(sourcesDuDepot())).toEqual(
      Object.keys(SCENARIOS_D_ECRITURE).sort(),
    );
  });

  it.each(Object.keys(SCENARIOS_D_ECRITURE))(
    "F-027-AC20 %s : la route l'exerce et la base le constate",
    async (point) => {
      await (SCENARIOS_D_ECRITURE[point] ?? (() => Promise.reject(new Error(point))))();
    },
    DELAI_MS,
  );

  it.each([
    [
      "un fichier du serveur qui écrit un nom par Drizzle",
      "apps/server/src/autre.ts",
      "await db.update(user).set({ name });\n",
      "apps/server/src/autre.ts : requête d'écriture du compte (1)",
    ],
    [
      "un fichier qui écrit une empreinte en SQL",
      "packages/db/src/autre.ts",
      `update "account" set "password" = $1`,
      "packages/db/src/autre.ts : requête d'écriture du compte (1)",
    ],
    [
      "un second appelant de ecrireEmpreinte",
      "apps/server/src/autre.ts",
      "await ecrireEmpreinte(db, id, e);\n",
      "apps/server/src/autre.ts : appel de ecrireEmpreinte (1)",
    ],
  ])("F-027-AC20 l'énumération voit %s, qui n'a pas de scénario", (_cas, chemin, texte, point) => {
    const depot = sourcesDuDepot();
    depot.set(chemin, texte);

    expect(pointsDEcritureDuCompte(depot)).toContain(point);
    expect(Object.keys(SCENARIOS_D_ECRITURE)).not.toContain(point);
  });
});

describe("liste fermée de F-009-AC17 (F-027-AC20, H1)", () => {
  it(
    "F-027-AC20 F-009-AC17 les routes natives de mot de passe, de compte et de sessions reçoivent 404 ressource-introuvable, même avec une session valide",
    async () => {
      serveur = await lancerServeur(base);
      const titulaire = await creerUnTitulaire(base);
      const avant = await empreinteDuCompte(base, titulaire.id);

      for (const [methode, chemin] of ROUTES_NATIVES_FERMEES) {
        const reponse = await appeler(serveur, methode, chemin, {
          cookie: titulaire.cookie,
          ...(methode === "GET"
            ? {}
            : { corps: { currentPassword: "x", newPassword: "y", token: "z" } }),
        });
        await erreurDe(reponse, 404, "ressource-introuvable");
      }
      expect(await empreinteDuCompte(base, titulaire.id)).toBe(avant);
      expect((await lire(serveur, CHEMINS_COMPTES.moi, titulaire.cookie)).status).toBe(200);
    },
    DELAI_MS,
  );

  it(
    "F-027-AC20 F-009-AC13 les quatre routes d'authentification gardent leurs statuts, la déconnexion compris",
    async () => {
      serveur = await lancerServeur(base);
      const corps = corpsUnique("couture-f027");

      const ouverture = await inscrire(serveur, corps);
      const connexion = await connecter(serveur, corps);
      const session = await lire(serveur, CHEMINS_COMPTES.session, ouverture.cookie);
      const sortie = await deconnecter(serveur, ouverture.cookie);

      expect([connexion.status, session.status, sortie.status]).toEqual([200, 200, 200]);
      expect((await lire(serveur, CHEMINS_COMPTES.moi, ouverture.cookie)).status).toBe(401);
    },
    DELAI_DES_COMPTES_MS,
  );
});

// La partie d'une route du routeur d'Express que le test lit.
const schemaRouteExpress = z.object({
  path: z.string(),
  methods: z.record(z.string(), z.boolean()),
});

function routesEnregistrees(application: Express): string[] {
  return application.router.stack.flatMap((couche) => {
    const route = schemaRouteExpress.safeParse(couche.route);
    return route.success
      ? Object.keys(route.data.methods).map(
          (methode) => `${methode.toUpperCase()} ${route.data.path}`,
        )
      : [];
  });
}

const cle = ({ methode, chemin }: RouteApi): string => `${methode} ${chemin}`;

describe("routes protégées (F-027-AC20, F-011-AC8)", () => {
  it(
    "F-027-AC20 F-027-AC14 les cinq routes sont enregistrées sous /api/v1/, donc couvertes par le test de F-011-AC8, et aucune n'est publique",
    async () => {
      serveur = await lancerServeur(base);

      expect(routesEnregistrees(serveur.application)).toEqual(
        expect.arrayContaining(ROUTES_DU_COMPTE.map(cle)),
      );
      expect(ROUTES_DU_COMPTE.every(({ chemin }) => chemin.startsWith("/api/v1/"))).toBe(true);
      expect(ROUTES_PUBLIQUES.filter(({ chemin }) => chemin.startsWith("/api/v1/compte"))).toEqual(
        [],
      );
    },
    DELAI_MS,
  );
});

describe("avis par courriel (F-027-AC8)", () => {
  it("F-027-AC8 le module d'envoi de F-026 n'est pas livré : le serveur n'a aucune dépendance d'envoi et rien n'envoie de courriel", () => {
    const manifeste = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ) as { dependencies?: Record<string, string> };
    const sources = [...sourcesDuDepot()].filter(([chemin]) =>
      chemin.startsWith("apps/server/src/"),
    );

    expect(Object.keys(manifeste.dependencies ?? {})).not.toContain("nodemailer");
    expect(
      sources.filter(([, texte]) => /nodemailer|sendMail|envoyerUnCourriel/.test(texte)),
    ).toEqual([]);
  });
});
