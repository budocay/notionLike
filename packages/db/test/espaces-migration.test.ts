// Tables des espaces (F-011-AC30) : la migration réelle appliquée sur une base à l'état laissé par
// F-009, peuplée, en une seule transaction avec les autres migrations du lancement (F-008 H13), sa
// descente, et ce que les contraintes et les cascades refusent ou emportent.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import journal from "../migrations/meta/_journal.json" with { type: "json" };
import { DOSSIER_MIGRATIONS, lancerMigration } from "../src/migration.ts";
import {
  adhesion,
  espace,
  invitation,
  ROLES,
  ROLES_INVITABLES,
  session,
  user,
} from "../src/schema.ts";
import { ouvrirBaseEmbarquee, ouvrirBaseEmbarqueeMigree, type BaseEmbarquee } from "./essai.ts";

const ETAT_F_009 = fileURLToPath(new URL("./migrations-essai/etat-f-009", import.meta.url));
// Le dossier réel tel que F-011 l'a livré : depuis F-012, la table des documents référence
// l'espace, et la descente des espaces suit la sienne (`descentes/0002_documents.sql`), éprouvée
// par `documents-migration.test.ts`.
const ETAT_F_011 = fileURLToPath(new URL("./migrations-essai/etat-f-011", import.meta.url));
const DESCENTE = fileURLToPath(new URL("../descentes/0001_espaces.sql", import.meta.url));
const PHRASE_D_ECHEC = "La migration a échoué : aucune migration de ce lancement n'est appliquée.";
const TABLES_DES_COMPTES = ["account", "session", "user", "verification"];
const TABLES_DES_ESPACES = ["adhesion", "espace", "invitation"];
const SUIVI_DE_F_009 = journal.entries.slice(0, 1).map((entree) => String(entree.when));
const SUIVI_APRES_MONTEE = journal.entries.map((entree) => String(entree.when));
const ID_ESPACE = "0b0f6f4e-4f7a-4e43-9a52-7b0b3c3f0a01";
const AUTRE_ESPACE = "0b0f6f4e-4f7a-4e43-9a52-7b0b3c3f0a02";
const EMPREINTE = "a".repeat(64);
const CREE_LE = new Date("2026-10-13T10:00:00.000Z");
const EXPIRE_LE = new Date("2026-10-20T10:00:00.000Z");
// Chaque base embarquée est une instance PGlite neuve ; la première du fichier compile le
// WebAssembly et fait un initdb, plusieurs secondes quand toute la suite tourne en parallèle.
// Un test qui ouvre sa base dans son corps a donc ce délai explicite, comme dans `comptes.test.ts`.
const DELAI_D_OUVERTURE_D_UNE_BASE_MS = 30_000;

type Db = BaseEmbarquee["base"]["db"];

async function lancer(embarquee: BaseEmbarquee, dossier: string) {
  const lignes: string[] = [];
  const code = await lancerMigration(embarquee.pilote, dossier, (ligne) => {
    lignes.push(ligne);
  });
  return { code, lignes };
}

async function valeurs(db: Db, requete: ReturnType<typeof sql>): Promise<unknown[]> {
  const resultat: unknown = await db.execute(requete);
  expect(resultat).toHaveProperty("rows");
  return (resultat as { rows: Record<string, unknown>[] }).rows.map(
    (ligne) => Object.values(ligne)[0],
  );
}

// Depuis F-012, la migration des documents suit celle des espaces : les constats de ce fichier ne
// portent que sur les tables des comptes et des espaces, ceux des documents sont dans
// `documents-migration.test.ts`.
const tablesPubliques = (db: Db) =>
  valeurs(
    db,
    sql`select tablename from pg_tables where schemaname = 'public'
        and tablename in ('account', 'session', 'user', 'verification', 'adhesion', 'espace', 'invitation')
        order by tablename`,
  );

const suivi = (db: Db) =>
  valeurs(db, sql`select created_at::text from drizzle.__drizzle_migrations order by id`);

const colonnes = (db: Db) =>
  valeurs(
    db,
    sql`select table_name || '.' || column_name || ' ' || data_type
          || case when is_nullable = 'NO' then ' not null' else '' end
          || coalesce(' default ' || column_default, '')
        from information_schema.columns
        where table_schema = 'public' and table_name in ('adhesion', 'espace', 'invitation')
        order by table_name, ordinal_position`,
  );

const contraintes = (db: Db) =>
  valeurs(
    db,
    sql`select conname || ' : ' || pg_get_constraintdef(oid) from pg_constraint
        where connamespace = 'public'::regnamespace and contype <> 'n'
        and conrelid::regclass::text in ('adhesion', 'espace', 'invitation') order by conname`,
  );

const indexAjoutes = (db: Db) =>
  valeurs(
    db,
    sql`select indexdef from pg_indexes where schemaname = 'public'
        and tablename in ('adhesion', 'espace', 'invitation')
        and indexname not in (select conname from pg_constraint) order by indexname`,
  );

async function contrainteQuiRefuse(ecriture: Promise<unknown>): Promise<unknown> {
  const issue: unknown = await ecriture.then(
    () => "l'écriture a abouti",
    (erreur: unknown) => erreur,
  );
  expect(issue).toBeInstanceOf(Error);
  const moteur = (issue as Error).cause ?? issue;
  return (moteur as { constraint?: unknown }).constraint;
}

// Le code SQLSTATE de l'erreur du moteur : 23502 pour une colonne `not null` laissée vide.
async function codeDuRefus(ecriture: Promise<unknown>): Promise<unknown> {
  const issue: unknown = await ecriture.then(
    () => "l'écriture a abouti",
    (erreur: unknown) => erreur,
  );
  expect(issue).toBeInstanceOf(Error);
  const moteur = (issue as Error).cause ?? issue;
  return (moteur as { code?: unknown }).code;
}

const COLONNES_ATTENDUES = [
  "adhesion.idEspace uuid not null",
  "adhesion.idCompte uuid not null",
  "adhesion.role text not null",
  "espace.id uuid not null",
  "espace.nom text not null",
  "invitation.id uuid not null default gen_random_uuid()",
  "invitation.idEspace uuid not null",
  "invitation.role text not null",
  "invitation.empreinte text not null",
  "invitation.creeLe timestamp with time zone not null",
  "invitation.expireLe timestamp with time zone not null",
  "invitation.accepteeLe timestamp with time zone",
  "invitation.revoqueeLe timestamp with time zone",
];

const CONTRAINTES_ATTENDUES = [
  'adhesion_idCompte_user_id_fk : FOREIGN KEY ("idCompte") REFERENCES "user"(id) ON DELETE CASCADE',
  'adhesion_idEspace_espace_id_fk : FOREIGN KEY ("idEspace") REFERENCES espace(id) ON DELETE CASCADE',
  'adhesion_pkey : PRIMARY KEY ("idEspace", "idCompte")',
  "adhesion_role_valide : CHECK ((role = ANY (ARRAY['proprietaire'::text, 'editeur'::text, 'lecteur'::text])))",
  "espace_nom_longueur : CHECK (((char_length(nom) >= 1) AND (char_length(nom) <= 100)))",
  "espace_pkey : PRIMARY KEY (id)",
  "invitation_empreinte_sha256 : CHECK ((empreinte ~ '^[0-9a-f]{64}$'::text))",
  "invitation_empreinte_unique : UNIQUE (empreinte)",
  'invitation_expire_apres_creation : CHECK (("expireLe" > "creeLe"))',
  'invitation_idEspace_espace_id_fk : FOREIGN KEY ("idEspace") REFERENCES espace(id) ON DELETE CASCADE',
  "invitation_pkey : PRIMARY KEY (id)",
  "invitation_role_invitable : CHECK ((role = ANY (ARRAY['editeur'::text, 'lecteur'::text])))",
  'invitation_un_seul_denouement : CHECK ((("accepteeLe" IS NULL) OR ("revoqueeLe" IS NULL)))',
];

// La clé primaire (espace, compte) indexe la clé étrangère vers l'espace ; les deux autres clés
// étrangères ont leur index.
const INDEX_ATTENDUS = [
  'CREATE INDEX "adhesion_idCompte_idx" ON public.adhesion USING btree ("idCompte")',
  'CREATE INDEX "invitation_idEspace_idx" ON public.invitation USING btree ("idEspace")',
];

async function constaterLaStructure(db: Db): Promise<void> {
  expect(await tablesPubliques(db)).toEqual([...TABLES_DES_COMPTES, ...TABLES_DES_ESPACES].sort());
  expect(await colonnes(db)).toEqual(COLONNES_ATTENDUES);
  expect(await contraintes(db)).toEqual(CONTRAINTES_ATTENDUES);
  expect(await indexAjoutes(db)).toEqual(INDEX_ATTENDUS);
  expect(await suivi(db)).toEqual(SUIVI_APRES_MONTEE);
}

// Une base à l'état laissé par F-009, avec un compte et sa session.
async function baseDeF009(): Promise<{ embarquee: BaseEmbarquee; idCompte: string }> {
  const embarquee = await ouvrirBaseEmbarquee();
  expect(await lancer(embarquee, ETAT_F_009)).toEqual({ code: 0, lignes: [] });
  const { db } = embarquee.base;
  const [compte] = await db
    .insert(user)
    .values({ name: "Anne", email: "anne@exemple.test" })
    .returning({ id: user.id });
  const idCompte = compte?.id ?? "";
  await db.insert(session).values({ userId: idCompte, token: "jeton-anne", expiresAt: EXPIRE_LE });
  return { embarquee, idCompte };
}

async function peupler(db: Db, idCompte: string): Promise<void> {
  await db.insert(espace).values([
    { id: ID_ESPACE, nom: "Équipe" },
    { id: AUTRE_ESPACE, nom: "Autre" },
  ]);
  await db.insert(adhesion).values([
    { idEspace: ID_ESPACE, idCompte, role: "proprietaire" },
    { idEspace: AUTRE_ESPACE, idCompte, role: "lecteur" },
  ]);
  await db.insert(invitation).values([
    {
      idEspace: ID_ESPACE,
      role: "editeur",
      empreinte: EMPREINTE,
      creeLe: CREE_LE,
      expireLe: EXPIRE_LE,
    },
    {
      idEspace: AUTRE_ESPACE,
      role: "lecteur",
      empreinte: "b".repeat(64),
      creeLe: CREE_LE,
      expireLe: EXPIRE_LE,
    },
  ]);
}

describe("migration des espaces", () => {
  it(
    "F-011-AC30 F-008-AC15 sur une base peuplée à l'état laissé par F-009 la commande crée espace, adhesion et invitation, laisse les comptes intacts, la consigne, et relancée n'en réapplique aucune",
    async () => {
      const { embarquee, idCompte } = await baseDeF009();
      const { db } = embarquee.base;
      expect(await suivi(db)).toEqual(SUIVI_DE_F_009);
      expect(readFileSync(`${ETAT_F_009}/0000_comptes.sql`, "utf8")).toBe(
        readFileSync(`${DOSSIER_MIGRATIONS}/0000_comptes.sql`, "utf8"),
      );

      expect(await lancer(embarquee, DOSSIER_MIGRATIONS)).toEqual({ code: 0, lignes: [] });
      await constaterLaStructure(db);
      expect(await db.select({ id: user.id }).from(user)).toEqual([{ id: idCompte }]);
      expect(await db.select({ token: session.token }).from(session)).toEqual([
        { token: "jeton-anne" },
      ]);

      expect(await lancer(embarquee, DOSSIER_MIGRATIONS)).toEqual({ code: 0, lignes: [] });
      await constaterLaStructure(db);
      await embarquee.base.fermer();
    },
    DELAI_D_OUVERTURE_D_UNE_BASE_MS,
  );

  it(
    "F-011-AC30 F-008-AC16 F-009-AC21 sur une base vide les deux migrations passent dans un seul lancement ; si la seconde échoue, la première est annulée avec elle",
    async () => {
      const embarquee = await ouvrirBaseEmbarquee();
      const { db } = embarquee.base;
      // `adhesion` est créée avant `espace` et `invitation` : l'obstacle fait échouer 0001 en route.
      await db.execute(sql`create table "invitation" (obstacle integer)`);

      const defaillant = await lancer(embarquee, DOSSIER_MIGRATIONS);

      expect(defaillant.code).toBe(1);
      expect(defaillant.lignes[0]).toBe(PHRASE_D_ECHEC);
      expect(defaillant.lignes.slice(1).join(" | ")).toMatch(/invitation.*already exists/);
      expect(await tablesPubliques(db)).toEqual(["invitation"]);
      expect(await suivi(db)).toEqual([]);

      await db.execute(sql`drop table "invitation"`);
      expect(await lancer(embarquee, DOSSIER_MIGRATIONS)).toEqual({ code: 0, lignes: [] });
      await constaterLaStructure(db);
      await embarquee.base.fermer();
    },
    DELAI_D_OUVERTURE_D_UNE_BASE_MS,
  );

  it(
    "F-011-AC30 la descente ramène une base peuplée à l'état laissé par F-009, comptes intacts, et la commande réapplique ensuite la migration",
    async () => {
      const { embarquee, idCompte } = await baseDeF009();
      const { db } = embarquee.base;
      expect(await lancer(embarquee, ETAT_F_011)).toEqual({ code: 0, lignes: [] });
      expect(await suivi(db)).toEqual(SUIVI_APRES_MONTEE.slice(0, 2));
      await peupler(db, idCompte);
      const instructions = readFileSync(DESCENTE, "utf8")
        .split("--> statement-breakpoint")
        .map((instruction) => instruction.replace(/^--.*$/gm, "").trim());
      expect(instructions).toHaveLength(TABLES_DES_ESPACES.length + 1);
      expect(instructions.at(-1)).toContain(String(journal.entries[1]?.when));

      await db.transaction(async (transaction) => {
        for (const instruction of instructions) {
          await transaction.execute(sql.raw(instruction));
        }
      });

      expect(await tablesPubliques(db)).toEqual(TABLES_DES_COMPTES);
      expect(await suivi(db)).toEqual(SUIVI_DE_F_009);
      expect(await db.select({ id: user.id }).from(user)).toEqual([{ id: idCompte }]);
      expect(await lancer(embarquee, DOSSIER_MIGRATIONS)).toEqual({ code: 0, lignes: [] });
      await constaterLaStructure(db);
      expect(await db.select().from(espace)).toEqual([]);
      await embarquee.base.fermer();
    },
    DELAI_D_OUVERTURE_D_UNE_BASE_MS,
  );
});

describe("contraintes des espaces", () => {
  it("F-011-AC30 les rôles contraints en base sont ceux du schéma : trois pour une adhésion, deux pour une invitation", () => {
    expect(ROLES).toEqual(["proprietaire", "editeur", "lecteur"]);
    expect(ROLES_INVITABLES).toEqual(["editeur", "lecteur"]);
    const roles = (ligne: string | undefined) =>
      [...(ligne ?? "").matchAll(/'(\w+)'::text/g)].map((m) => m[1]);
    expect(roles(CONTRAINTES_ATTENDUES.find((c) => c.startsWith("adhesion_role_valide")))).toEqual([
      ...ROLES,
    ]);
    expect(
      roles(CONTRAINTES_ATTENDUES.find((c) => c.startsWith("invitation_role_invitable"))),
    ).toEqual([...ROLES_INVITABLES]);
  });

  it(
    "F-011-AC30 F-011-AC1 la base refuse un espace sans identifiant, un nom vide ou de plus de 100 caractères, une seconde adhésion du même compte, un rôle hors liste, une invitation propriétaire, une empreinte en double ou qui n'est pas un SHA-256",
    async () => {
      const { base } = await ouvrirBaseEmbarqueeMigree();
      const { db } = base;
      const [compte] = await db
        .insert(user)
        .values({ name: "Anne", email: "anne@exemple.test" })
        .returning({ id: user.id });
      const idCompte = compte?.id ?? "";
      await peupler(db, idCompte);
      const inviter = (valeurs: Partial<typeof invitation.$inferInsert>) =>
        db.insert(invitation).values({
          idEspace: ID_ESPACE,
          role: "lecteur",
          empreinte: "c".repeat(64),
          creeLe: CREE_LE,
          expireLe: EXPIRE_LE,
          ...valeurs,
        });

      // Aucune valeur par défaut : l'identifiant vient toujours du client (F-011 H3).
      expect(
        await codeDuRefus(db.execute(sql`insert into espace (nom) values ('Sans identifiant')`)),
      ).toBe("23502");
      expect(
        await contrainteQuiRefuse(
          db.insert(espace).values({ id: AUTRE_ESPACE.replace("02", "03"), nom: "" }),
        ),
      ).toBe("espace_nom_longueur");
      expect(
        await contrainteQuiRefuse(
          db.insert(espace).values({ id: AUTRE_ESPACE.replace("02", "03"), nom: "n".repeat(101) }),
        ),
      ).toBe("espace_nom_longueur");
      expect(
        await contrainteQuiRefuse(
          db.insert(adhesion).values({ idEspace: ID_ESPACE, idCompte, role: "editeur" }),
        ),
      ).toBe("adhesion_pkey");
      expect(
        await contrainteQuiRefuse(
          db.execute(
            sql`update adhesion set role = 'administrateur' where "idCompte" = ${idCompte}`,
          ),
        ),
      ).toBe("adhesion_role_valide");
      expect(
        await contrainteQuiRefuse(db.execute(sql`update invitation set role = 'proprietaire'`)),
      ).toBe("invitation_role_invitable");
      expect(await contrainteQuiRefuse(inviter({ empreinte: EMPREINTE }))).toBe(
        "invitation_empreinte_unique",
      );
      expect(await contrainteQuiRefuse(inviter({ empreinte: "jeton-en-clair" }))).toBe(
        "invitation_empreinte_sha256",
      );
      expect(await contrainteQuiRefuse(inviter({ expireLe: CREE_LE }))).toBe(
        "invitation_expire_apres_creation",
      );
      expect(await contrainteQuiRefuse(inviter({ accepteeLe: CREE_LE, revoqueeLe: CREE_LE }))).toBe(
        "invitation_un_seul_denouement",
      );
      expect(await db.select({ nom: espace.nom }).from(espace).orderBy(espace.nom)).toEqual([
        { nom: "Autre" },
        { nom: "Équipe" },
      ]);
      expect(await db.$count(invitation)).toBe(2);
      await base.fermer();
    },
    DELAI_D_OUVERTURE_D_UNE_BASE_MS,
  );

  it(
    "F-011-AC30 F-011-AC6 supprimer un espace emporte ses adhésions et ses invitations, rien de lisible n'en reste, et laisse l'autre espace et les comptes",
    async () => {
      const { base } = await ouvrirBaseEmbarqueeMigree();
      const { db } = base;
      const [compte] = await db
        .insert(user)
        .values({ name: "Anne", email: "anne@exemple.test" })
        .returning({ id: user.id });
      const idCompte = compte?.id ?? "";
      await peupler(db, idCompte);

      await db.delete(espace).where(eq(espace.id, ID_ESPACE));

      expect(await db.select({ idEspace: adhesion.idEspace }).from(adhesion)).toEqual([
        { idEspace: AUTRE_ESPACE },
      ]);
      expect(await db.select({ idEspace: invitation.idEspace }).from(invitation)).toEqual([
        { idEspace: AUTRE_ESPACE },
      ]);
      expect(
        await valeurs(
          db,
          sql`select count(*)::int from adhesion a left join espace e on e.id = a."idEspace" where e.id is null`,
        ),
      ).toEqual([0]);
      expect(await db.select({ id: user.id }).from(user)).toEqual([{ id: idCompte }]);
      await base.fermer();
    },
    DELAI_D_OUVERTURE_D_UNE_BASE_MS,
  );

  it(
    "F-011-AC30 supprimer un compte emporte ses adhésions et laisse les espaces, leurs invitations et les adhésions des autres comptes",
    async () => {
      const { base } = await ouvrirBaseEmbarqueeMigree();
      const { db } = base;
      const comptes = await db
        .insert(user)
        .values([
          { name: "Anne", email: "anne@exemple.test" },
          { name: "Bob", email: "bob@exemple.test" },
        ])
        .returning({ id: user.id });
      const [anne = "", bob = ""] = comptes.map((compte) => compte.id);
      await peupler(db, anne);
      await db.insert(adhesion).values({ idEspace: ID_ESPACE, idCompte: bob, role: "editeur" });

      await db.delete(user).where(eq(user.id, anne));

      expect(await db.select().from(adhesion)).toEqual([
        { idEspace: ID_ESPACE, idCompte: bob, role: "editeur" },
      ]);
      expect(await db.$count(espace)).toBe(2);
      expect(await db.$count(invitation)).toBe(2);
      await base.fermer();
    },
    DELAI_D_OUVERTURE_D_UNE_BASE_MS,
  );
});
