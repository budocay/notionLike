// Couture entre better-auth et `@notionlike/db` : l'adaptateur Drizzle de better-auth reçoit
// `Base["db"]` et `schemaComptes` tels que `@notionlike/db` les publie. pnpm installe deux copies
// de drizzle-orm (celle de `packages/db`, celle de l'adaptateur) : ce test prouve qu'elles
// s'entendent, à la compilation comme à l'exécution.
import { schemaComptes } from "@notionlike/db";
import { ouvrirBaseEmbarqueeMigree, type BaseEmbarquee } from "@notionlike/db/essai";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const SECRET_D_ESSAI = "secret-d-essai-de-trente-deux-caracteres-au-moins";
const COMPTE = { name: "Ada", email: "ada@exemple.test", password: "mot-de-passe-d-essai" };

let embarquee: BaseEmbarquee;

beforeAll(async () => {
  embarquee = await ouvrirBaseEmbarqueeMigree();
});
afterAll(() => embarquee.base.fermer());

describe("adaptateur Drizzle de better-auth sur la base de @notionlike/db", () => {
  it("F-009-AC1 F-009-AC7 un compte est créé puis connecté, ses lignes écrites par l'adaptateur", async () => {
    const auth = betterAuth({
      baseURL: "http://127.0.0.1:3000",
      secret: SECRET_D_ESSAI,
      database: drizzleAdapter(embarquee.base.db, { provider: "pg", schema: schemaComptes }),
      emailAndPassword: { enabled: true },
      advanced: { database: { generateId: "uuid" } },
    });

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
  });
});
