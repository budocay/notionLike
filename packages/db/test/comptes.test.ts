// Tables des comptes (F-009-AC21) : la migration réelle, appliquée sur la base embarquée depuis
// une base vide et depuis l'état laissé par F-008, sa descente, et l'accord entre le schéma Drizzle
// et ce que la migration crée.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { getTableColumns, getTableName, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import journal from "../migrations/meta/_journal.json" with { type: "json" };
import { schemaComptes } from "../src/index.ts";
import { DOSSIER_MIGRATIONS, lancerMigration } from "../src/migration.ts";
import { ouvrirBaseEmbarquee, ouvrirBaseEmbarqueeMigree, type BaseEmbarquee } from "./essai.ts";

const ETAT_F_008 = fileURLToPath(new URL("./migrations-essai/etat-f-008", import.meta.url));
const DESCENTE = fileURLToPath(new URL("../descentes/0000_comptes.sql", import.meta.url));
const PHRASE_D_ECHEC = "La migration a échoué : aucune migration de ce lancement n'est appliquée.";
const TABLES = ["account", "session", "user", "verification"];
const SUIVI_APRES_MONTEE = journal.entries.map((entree) => String(entree.when));
const DANS_UNE_HEURE = new Date(Date.now() + 3_600_000);

const { user, session, account } = schemaComptes;
type Db = BaseEmbarquee["base"]["db"];

interface Lancement {
  readonly code: number;
  readonly lignes: readonly string[];
}

async function lancer(embarquee: BaseEmbarquee, dossier: string): Promise<Lancement> {
  const lignes: string[] = [];
  const code = await lancerMigration(embarquee.pilote, dossier, (ligne) => {
    lignes.push(ligne);
  });
  return { code, lignes };
}

// La première colonne de chaque ligne rendue.
async function valeurs(db: Db, requete: ReturnType<typeof sql>): Promise<unknown[]> {
  const resultat: unknown = await db.execute(requete);
  expect(resultat).toHaveProperty("rows");
  return (resultat as { rows: Record<string, unknown>[] }).rows.map(
    (ligne) => Object.values(ligne)[0],
  );
}

const tablesPubliques = (db: Db): Promise<unknown[]> =>
  valeurs(db, sql`select tablename from pg_tables where schemaname = 'public' order by tablename`);

const suivi = (db: Db): Promise<unknown[]> =>
  valeurs(db, sql`select created_at::text from drizzle.__drizzle_migrations order by id`);

const colonnes = (db: Db): Promise<unknown[]> =>
  valeurs(
    db,
    sql`select table_name || '.' || column_name || ' ' || data_type
          || case when is_nullable = 'NO' then ' not null' else '' end
          || coalesce(' default ' || column_default, '')
        from information_schema.columns where table_schema = 'public'
        order by table_name, ordinal_position`,
  );

// Clés primaires, unicités, clés étrangères et contrôles ; les `not null` sont lus avec les colonnes.
const contraintes = (db: Db): Promise<unknown[]> =>
  valeurs(
    db,
    sql`select conname || ' : ' || pg_get_constraintdef(oid) from pg_constraint
        where connamespace = 'public'::regnamespace and contype <> 'n' order by conname`,
  );

// Les index que la migration crée elle-même : ceux des clés primaires et des unicités sont déjà
// constatés par les contraintes.
const indexAjoutes = (db: Db): Promise<unknown[]> =>
  valeurs(
    db,
    sql`select indexdef from pg_indexes where schemaname = 'public'
        and indexname not in (select conname from pg_constraint) order by indexname`,
  );

// Le nom de la contrainte qui a refusé l'écriture, lu sur l'erreur du moteur.
async function contrainteQuiRefuse(ecriture: Promise<unknown>): Promise<unknown> {
  const issue: unknown = await ecriture.then(
    () => "l'écriture a abouti",
    (erreur: unknown) => erreur,
  );
  expect(issue).toBeInstanceOf(Error);
  const moteur = (issue as Error).cause ?? issue;
  return (moteur as { constraint?: unknown }).constraint;
}

async function creerCompte(db: Db, email: string): Promise<string> {
  const [cree] = await db.insert(user).values({ name: "Essai", email }).returning({ id: user.id });
  expect(cree).toBeDefined();
  return cree?.id ?? "";
}

async function ouvrirSession(db: Db, userId: string, token: string): Promise<void> {
  await db.insert(session).values({ userId, token, expiresAt: DANS_UNE_HEURE });
}

const COLONNES_ATTENDUES = [
  "account.id uuid not null default gen_random_uuid()",
  "account.accountId text not null",
  "account.providerId text not null",
  "account.userId uuid not null",
  "account.accessToken text",
  "account.refreshToken text",
  "account.idToken text",
  "account.accessTokenExpiresAt timestamp with time zone",
  "account.refreshTokenExpiresAt timestamp with time zone",
  "account.scope text",
  "account.password text",
  "account.createdAt timestamp with time zone not null default now()",
  "account.updatedAt timestamp with time zone not null default now()",
  "session.id uuid not null default gen_random_uuid()",
  "session.expiresAt timestamp with time zone not null",
  "session.token text not null",
  "session.createdAt timestamp with time zone not null default now()",
  "session.updatedAt timestamp with time zone not null default now()",
  "session.ipAddress text",
  "session.userAgent text",
  "session.userId uuid not null",
  "user.id uuid not null default gen_random_uuid()",
  "user.name text not null",
  "user.email text not null",
  "user.emailVerified boolean not null default false",
  "user.image text",
  "user.createdAt timestamp with time zone not null default now()",
  "user.updatedAt timestamp with time zone not null default now()",
  "verification.id uuid not null default gen_random_uuid()",
  "verification.identifier text not null",
  "verification.value text not null",
  "verification.expiresAt timestamp with time zone not null",
  "verification.createdAt timestamp with time zone not null default now()",
  "verification.updatedAt timestamp with time zone not null default now()",
];

const CONTRAINTES_ATTENDUES = [
  "account_pkey : PRIMARY KEY (id)",
  'account_userId_user_id_fk : FOREIGN KEY ("userId") REFERENCES "user"(id) ON DELETE CASCADE',
  "session_pkey : PRIMARY KEY (id)",
  "session_token_unique : UNIQUE (token)",
  'session_userId_user_id_fk : FOREIGN KEY ("userId") REFERENCES "user"(id) ON DELETE CASCADE',
  "user_email_minuscules : CHECK ((email = lower(email)))",
  "user_email_unique : UNIQUE (email)",
  "user_pkey : PRIMARY KEY (id)",
  "verification_pkey : PRIMARY KEY (id)",
];

const INDEX_ATTENDUS = [
  'CREATE INDEX "account_userId_idx" ON public.account USING btree ("userId")',
  'CREATE INDEX "session_expiresAt_idx" ON public.session USING btree ("expiresAt")',
  'CREATE INDEX "session_userId_idx" ON public.session USING btree ("userId")',
  "CREATE INDEX verification_identifier_idx ON public.verification USING btree (identifier)",
];

async function constaterLaStructure(db: Db): Promise<void> {
  expect(await tablesPubliques(db)).toEqual(TABLES);
  expect(await colonnes(db)).toEqual(COLONNES_ATTENDUES);
  expect(await contraintes(db)).toEqual(CONTRAINTES_ATTENDUES);
  expect(await indexAjoutes(db)).toEqual(INDEX_ATTENDUS);
  expect(await suivi(db)).toEqual(SUIVI_APRES_MONTEE);
}

describe("migration des comptes", () => {
  it("F-009-AC21 F-008-AC15 sur une base vide la commande crée les quatre tables, leurs identifiants uuid, unicités, index et cascades, sans table rateLimit, la consigne, et relancée n'en réapplique aucune", async () => {
    const embarquee = await ouvrirBaseEmbarquee();
    expect(await tablesPubliques(embarquee.base.db)).toEqual([]);

    expect(await lancer(embarquee, DOSSIER_MIGRATIONS)).toEqual({ code: 0, lignes: [] });
    await constaterLaStructure(embarquee.base.db);

    // Réappliquée, `create table "account"` échouerait : le code 0 prouve qu'elle ne l'est pas.
    expect(await lancer(embarquee, DOSSIER_MIGRATIONS)).toEqual({ code: 0, lignes: [] });
    await constaterLaStructure(embarquee.base.db);
    await embarquee.base.fermer();
  });

  it("F-009-AC21 sur une base à l'état laissé par F-008 (table de suivi vide, aucune table) la commande crée la même structure", async () => {
    const embarquee = await ouvrirBaseEmbarquee();
    expect(await lancer(embarquee, ETAT_F_008)).toEqual({ code: 0, lignes: [] });
    expect(await suivi(embarquee.base.db)).toEqual([]);
    expect(await tablesPubliques(embarquee.base.db)).toEqual([]);

    expect(await lancer(embarquee, DOSSIER_MIGRATIONS)).toEqual({ code: 0, lignes: [] });

    await constaterLaStructure(embarquee.base.db);
    await embarquee.base.fermer();
  });

  it("F-009-AC21 F-008-AC16 la migration qui échoue en route est annulée en entier, la base d'avant reste intacte, et la relance après correction applique tout", async () => {
    const embarquee = await ouvrirBaseEmbarquee();
    const { db } = embarquee.base;
    expect(await lancer(embarquee, ETAT_F_008)).toEqual({ code: 0, lignes: [] });
    // `account` est créée avant `session` : l'obstacle fait échouer la migration après un succès.
    await db.execute(sql`create table "session" (obstacle integer)`);

    const defaillant = await lancer(embarquee, DOSSIER_MIGRATIONS);

    expect(defaillant.code).toBe(1);
    expect(defaillant.lignes[0]).toBe(PHRASE_D_ECHEC);
    expect(defaillant.lignes.slice(1).join(" | ")).toMatch(/session.*already exists/);
    expect(await tablesPubliques(db)).toEqual(["session"]);
    expect(await colonnes(db)).toEqual(["session.obstacle integer"]);
    expect(await suivi(db)).toEqual([]);

    await db.execute(sql`drop table "session"`);
    expect(await lancer(embarquee, DOSSIER_MIGRATIONS)).toEqual({ code: 0, lignes: [] });
    await constaterLaStructure(db);
    await embarquee.base.fermer();
  });

  it("F-009-AC21 la descente ramène une base peuplée à l'état laissé par F-008, et la commande réapplique ensuite la migration", async () => {
    const embarquee = await ouvrirBaseEmbarqueeMigree();
    const { db } = embarquee.base;
    await ouvrirSession(db, await creerCompte(db, "descente@exemple.test"), "jeton-descente");
    const instructions = readFileSync(DESCENTE, "utf8")
      .split("--> statement-breakpoint")
      .map((instruction) => instruction.replace(/^--.*$/gm, "").trim());
    expect(instructions).toHaveLength(TABLES.length + 1);

    await db.transaction(async (transaction) => {
      for (const instruction of instructions) {
        await transaction.execute(sql.raw(instruction));
      }
    });

    expect(await tablesPubliques(db)).toEqual([]);
    expect(await suivi(db)).toEqual([]);
    expect(await lancer(embarquee, DOSSIER_MIGRATIONS)).toEqual({ code: 0, lignes: [] });
    await constaterLaStructure(db);
    expect(await db.select().from(user)).toEqual([]);
    await embarquee.base.fermer();
  });
});

describe("accord du schéma Drizzle et de la migration", () => {
  it("F-009-AC21 F-009-AC23 chaque table du schéma des comptes a en base exactement ses colonnes, et le schéma n'a que les quatre tables natives", async () => {
    const { base } = await ouvrirBaseEmbarqueeMigree();
    const duSchema = Object.entries(schemaComptes).flatMap(([modele, table]) => {
      expect(getTableName(table)).toBe(modele);
      return Object.entries(getTableColumns(table)).map(([propriete, colonne]) => {
        // L'adaptateur de better-auth retrouve un champ par sa propriété : colonne du même nom.
        expect(colonne.name).toBe(propriete);
        return `${modele}.${propriete}`;
      });
    });

    expect(Object.keys(schemaComptes).sort()).toEqual(TABLES);
    expect(duSchema).toHaveLength(COLONNES_ATTENDUES.length);
    expect(duSchema.sort()).toEqual(COLONNES_ATTENDUES.map((ligne) => ligne.split(" ")[0]).sort());
    await base.fermer();
  });

  it("F-009-AC23 l'accès typé écrit et relit un compte, une session et un identifiant de connexion par le schéma, identifiants et dates fournis par la base", async () => {
    const { base } = await ouvrirBaseEmbarqueeMigree();
    const id = await creerCompte(base.db, "typee@exemple.test");
    await ouvrirSession(base.db, id, "jeton-type");
    await base.db
      .insert(account)
      .values({ userId: id, accountId: id, providerId: "credential", password: "empreinte" });

    const [compte] = await base.db.select().from(user);
    const [ouverte] = await base.db.select().from(session);
    const [identifiant] = await base.db.select().from(account);

    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(compte).toMatchObject({ id, email: "typee@exemple.test", emailVerified: false });
    expect(compte?.image).toBeNull();
    expect(compte?.createdAt).toBeInstanceOf(Date);
    expect(ouverte).toMatchObject({ userId: id, token: "jeton-type", expiresAt: DANS_UNE_HEURE });
    expect(identifiant).toMatchObject({ userId: id, providerId: "credential" });
    await base.fermer();
  });
});

describe("contraintes des comptes", () => {
  it("F-009-AC21 F-009-AC2 un second compte au même courriel est refusé par l'unicité, un courriel qui porte une majuscule par le contrôle de casse, et le premier compte reste seul", async () => {
    const { base } = await ouvrirBaseEmbarqueeMigree();
    const ecrire = (email: string): Promise<unknown> =>
      base.db.insert(user).values({ name: "Autre", email });
    await creerCompte(base.db, "une@exemple.test");

    expect(await contrainteQuiRefuse(ecrire("une@exemple.test"))).toBe("user_email_unique");
    expect(await contrainteQuiRefuse(ecrire("Une@exemple.test"))).toBe("user_email_minuscules");

    expect(await base.db.select({ name: user.name, email: user.email }).from(user)).toEqual([
      { name: "Essai", email: "une@exemple.test" },
    ]);
    await base.fermer();
  });

  it("F-009-AC21 un second jeton de session identique est refusé, comme une session ou un identifiant de connexion sans compte", async () => {
    const { base } = await ouvrirBaseEmbarqueeMigree();
    const id = await creerCompte(base.db, "jeton@exemple.test");
    const inconnu = "00000000-0000-4000-8000-000000000000";
    await ouvrirSession(base.db, id, "jeton-unique");

    expect(await contrainteQuiRefuse(ouvrirSession(base.db, id, "jeton-unique"))).toBe(
      "session_token_unique",
    );
    expect(await contrainteQuiRefuse(ouvrirSession(base.db, inconnu, "jeton-orphelin"))).toBe(
      "session_userId_user_id_fk",
    );
    expect(
      await contrainteQuiRefuse(
        base.db.insert(account).values({ userId: inconnu, accountId: "a", providerId: "p" }),
      ),
    ).toBe("account_userId_user_id_fk");
    expect(await base.db.select({ token: session.token }).from(session)).toEqual([
      { token: "jeton-unique" },
    ]);
    await base.fermer();
  });

  it("F-009-AC21 supprimer un compte emporte ses sessions et ses identifiants de connexion, et laisse ceux des autres comptes", async () => {
    const { base } = await ouvrirBaseEmbarqueeMigree();
    const supprime = await creerCompte(base.db, "supprime@exemple.test");
    const garde = await creerCompte(base.db, "garde@exemple.test");
    for (const [id, nom] of [
      [supprime, "supprime"],
      [garde, "garde"],
    ] as const) {
      await ouvrirSession(base.db, id, `jeton-${nom}-1`);
      await ouvrirSession(base.db, id, `jeton-${nom}-2`);
      await base.db.insert(account).values({ userId: id, accountId: id, providerId: "credential" });
    }

    await base.db.delete(user).where(sql`${user.id} = ${supprime}`);

    expect(await base.db.select({ id: user.id }).from(user)).toEqual([{ id: garde }]);
    expect(
      await base.db.select({ token: session.token }).from(session).orderBy(session.token),
    ).toEqual([{ token: "jeton-garde-1" }, { token: "jeton-garde-2" }]);
    expect(await base.db.select({ userId: account.userId }).from(account)).toEqual([
      { userId: garde },
    ]);
    await base.fermer();
  });
});
