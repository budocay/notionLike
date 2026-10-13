// Couture entre better-auth et `@notionlike/db` : l'adaptateur Drizzle de better-auth reçoit
// `Base["db"]` et `schemaComptes` tels que `@notionlike/db` les publie. Selon la résolution de pnpm,
// `packages/db` (qui a construit les tables et l'accès) et l'adaptateur (qui en tire ses opérateurs
// `eq`, `inArray`… et `is(…, Column)`) chargent la même copie physique de drizzle-orm@0.45.3, ou
// deux copies dont les classes diffèrent. Ce test constate que l'une ou l'autre disposition tient :
// même copie, ou copies distinctes reliées par le marqueur `Symbol.for("drizzle:entityKind")` que
// la garde `is` lit sans instanceof ; le cas des copies distinctes est aussi donné en données, pour
// rester exercé quand il n'y a qu'une copie. Puis chaque opération de l'adaptateur rend, sur la base
// embarquée, ce qu'une lecture directe y trouve.
import { realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { schemaComptes } from "@notionlike/db";
import { ouvrirBaseEmbarqueeMigree, type BaseEmbarquee } from "@notionlike/db/essai";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DELAI_D_OUVERTURE_D_UNE_BASE_MS } from "./aides.ts";
import { DELAI_DES_COMPTES_MS } from "./aides-comptes.ts";

const SECRET_D_ESSAI = "secret-d-essai-de-trente-deux-caracteres-au-moins";
const COMPTE = { name: "Ada", email: "ada@exemple.test", password: "mot-de-passe-d-essai" };

// Le marqueur que chaque classe de drizzle-orm porte en propriété statique, partagé entre copies.
const ENTITE = Symbol.for("drizzle:entityKind");

function marqueurDe(classe: object): unknown {
  return (classe as Record<symbol, unknown>)[ENTITE];
}

interface CopieDeDrizzle {
  readonly dossier: string;
  readonly Column: abstract new (...arguments_: never[]) => unknown;
  is(valeur: unknown, classe: unknown): boolean;
}

// La copie de drizzle-orm que Node charge depuis le paquet dont `fichier` fait partie : son entrée
// ESM, celle qu'importent packages/db et l'adaptateur, chargée par `require` (même instance).
function copieDeDrizzleVuePar(fichier: string): CopieDeDrizzle {
  const entreeCjs = createRequire(fichier).resolve("drizzle-orm");
  const dossier = realpathSync(dirname(entreeCjs));
  const module = createRequire(import.meta.url)(join(dossier, "index.js")) as CopieDeDrizzle;
  return { dossier, Column: module.Column, is: module.is };
}

const RACINE = fileURLToPath(new URL("../../../", import.meta.url));
const PAQUET_DB = join(RACINE, "packages", "db", "package.json");
const PAQUET_ADAPTATEUR = createRequire(
  join(realpathSync(join(RACINE, "apps", "server", "node_modules", "better-auth")), "package.json"),
).resolve("@better-auth/drizzle-adapter");

let embarquee: BaseEmbarquee;

beforeAll(async () => {
  embarquee = await ouvrirBaseEmbarqueeMigree();
}, DELAI_D_OUVERTURE_D_UNE_BASE_MS);
afterAll(() => embarquee.base.fermer());

function construire() {
  return betterAuth({
    baseURL: "http://127.0.0.1:3000",
    secret: SECRET_D_ESSAI,
    database: drizzleAdapter(embarquee.base.db, {
      provider: "pg",
      schema: schemaComptes,
      transaction: true,
    }),
    emailAndPassword: { enabled: true },
    advanced: { database: { generateId: "uuid" } },
    telemetry: { enabled: false },
    logger: { disabled: true },
  });
}

describe("copies de drizzle-orm", () => {
  it("F-009-AC21 F-009-AC23 packages/db et l'adaptateur de better-auth chargent drizzle-orm@0.45.3 : une même copie, ou des copies distinctes que le marqueur partagé relie", () => {
    const deLaBase = copieDeDrizzleVuePar(PAQUET_DB);
    const deLAdaptateur = copieDeDrizzleVuePar(PAQUET_ADAPTATEUR);
    const memeCopie = deLaBase.dossier === deLAdaptateur.dossier;
    // Le cas des copies distinctes, en données : une classe étrangère à la copie de l'adaptateur,
    // reliée à sa colonne par le seul marqueur, qu'un contrôle par instanceof refuserait.
    class ColonneDUneAutreCopie {
      static readonly [ENTITE] = marqueurDe(deLaBase.Column);
    }
    const colonnes = [
      { nom: "colonne de packages/db", valeur: schemaComptes.user.email, instance: memeCopie },
      {
        nom: "colonne d'une copie distincte",
        valeur: new ColonneDUneAutreCopie(),
        instance: false,
      },
    ];

    expect(deLaBase.dossier).toMatch(/drizzle-orm@0\.45\.3_/);
    expect(deLAdaptateur.dossier).toMatch(/drizzle-orm@0\.45\.3_/);
    expect(deLaBase.Column === deLAdaptateur.Column).toBe(memeCopie);
    expect(schemaComptes.user.email).toBeInstanceOf(deLaBase.Column);
    expect(marqueurDe(deLaBase.Column)).toBe("Column");
    expect(marqueurDe(deLAdaptateur.Column)).toBe(marqueurDe(deLaBase.Column));
    expect(
      colonnes.map(({ nom, valeur }) => ({
        nom,
        instance: valeur instanceof deLAdaptateur.Column,
        reconnue: deLAdaptateur.is(valeur, deLAdaptateur.Column),
      })),
    ).toEqual(colonnes.map(({ nom, instance }) => ({ nom, instance, reconnue: true })));
  });

  it("F-009-AC21 F-009-AC23 la copie de l'adaptateur reconnaît pourtant une colonne de packages/db : sa garde `is` ne repose pas sur instanceof", () => {
    const deLAdaptateur = copieDeDrizzleVuePar(PAQUET_ADAPTATEUR);

    expect(deLAdaptateur.is(schemaComptes.user.email, deLAdaptateur.Column)).toBe(true);
    expect(deLAdaptateur.is({ name: "email" }, deLAdaptateur.Column)).toBe(false);
  });
});

describe("adaptateur Drizzle de better-auth sur la base de @notionlike/db", () => {
  it(
    "F-009-AC1 F-009-AC7 un compte est créé puis connecté, ses lignes écrites par l'adaptateur",
    async () => {
      const auth = construire();

      const inscription = await auth.api.signUpEmail({ body: COMPTE });
      const connexion = await auth.api.signInEmail({
        body: { email: COMPTE.email, password: COMPTE.password },
      });
      const comptes = await embarquee.base.db.select().from(schemaComptes.user);
      const sessions = await embarquee.base.db.select().from(schemaComptes.session);

      expect(connexion.user.id).toBe(inscription.user.id);
      expect(comptes.map(({ id, email }) => ({ id, email }))).toEqual([
        { id: inscription.user.id, email: COMPTE.email },
      ]);
      expect(sessions.map((session) => session.token).sort()).toEqual(
        [inscription.token, connexion.token].sort(),
      );
    },
    DELAI_DES_COMPTES_MS,
  );

  it(
    "F-009-AC21 chaque opération de l'adaptateur (création, lecture, opérateurs, tri, jointure, mise à jour, compte, suppression, transaction) rend ce que la base contient",
    async () => {
      const { adapter } = await construire().$context;
      const maintenant = new Date();
      const nouveau = (email: string) => ({
        name: email.split("@")[0] ?? "",
        email,
        emailVerified: false,
        createdAt: maintenant,
        updatedAt: maintenant,
      });

      const crees = [];
      for (const email of ["b@operateurs.test", "a@operateurs.test", "c@operateurs.test"]) {
        crees.push(
          await adapter.create<{ id: string; email: string }>({
            model: "user",
            data: nouveau(email),
          }),
        );
      }
      const [b, a, c] = crees;
      const session = await adapter.create<Record<string, unknown>, { id: string; token: string }>({
        model: "session",
        data: {
          userId: a?.id,
          token: "jeton-de-l-operateur-de-jointure",
          expiresAt: new Date(maintenant.getTime() + 60_000),
          createdAt: maintenant,
          updatedAt: maintenant,
        },
      });

      const lu = await adapter.findOne<{ id: string }>({
        model: "user",
        where: [{ field: "email", value: "a@operateurs.test" }],
      });
      const parmi = await adapter.findMany<{ email: string }>({
        model: "user",
        where: [
          { field: "email", operator: "in", value: ["a@operateurs.test", "c@operateurs.test"] },
        ],
        sortBy: { field: "email", direction: "desc" },
      });
      const sauf = await adapter.findMany<{ email: string }>({
        model: "user",
        where: [
          { field: "email", operator: "ends_with", value: "@operateurs.test" },
          { field: "email", operator: "ne", value: "b@operateurs.test" },
        ],
        sortBy: { field: "email", direction: "asc" },
        limit: 1,
        offset: 1,
      });
      const joint = await adapter.findOne<{ token: string; user: { email: string } }>({
        model: "session",
        where: [{ field: "token", value: session.token }],
        join: { user: true },
      });
      await adapter.update({
        model: "user",
        where: [{ field: "id", value: b?.id ?? "" }],
        update: { name: "renommé" },
      });
      const nombre = await adapter.count({
        model: "user",
        where: [{ field: "email", operator: "contains", value: "operateurs" }],
      });
      await adapter.delete({ model: "user", where: [{ field: "id", value: c?.id ?? "" }] });
      const annulee = await adapter
        .transaction(async (dansLaTransaction) => {
          await dansLaTransaction.create({ model: "user", data: nouveau("d@operateurs.test") });
          throw new Error("annulation voulue");
        })
        .then(
          () => "validée",
          (erreur: unknown) => (erreur as Error).message,
        );
      const restants = (await embarquee.base.db.select().from(schemaComptes.user))
        .filter(({ email }) => email.endsWith("@operateurs.test"))
        .map(({ email, name }) => ({ email, name }))
        .sort((x, y) => x.email.localeCompare(y.email));

      expect(lu?.id).toBe(a?.id);
      expect(parmi.map(({ email }) => email)).toEqual(["c@operateurs.test", "a@operateurs.test"]);
      expect(sauf.map(({ email }) => email)).toEqual(["c@operateurs.test"]);
      expect(joint).toMatchObject({ token: session.token, user: { email: "a@operateurs.test" } });
      expect(nombre).toBe(3);
      expect(annulee).toBe("annulation voulue");
      expect(restants).toEqual([
        { email: "a@operateurs.test", name: "a" },
        { email: "b@operateurs.test", name: "renommé" },
      ]);
    },
    DELAI_DES_COMPTES_MS,
  );
});
