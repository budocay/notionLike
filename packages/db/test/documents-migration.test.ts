// Table des documents (F-012-AC28) : la migration réelle appliquée sur une base peuplée à l'état
// laissé par F-011, en une seule transaction avec les autres migrations du lancement (F-008 H13),
// sa descente, et ce que les contraintes et les cascades refusent ou emportent.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { eq, getTableColumns, getTableName, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import journal from "../migrations/meta/_journal.json" with { type: "json" };
import { DOSSIER_MIGRATIONS, lancerMigration } from "../src/migration.ts";
import { adhesion, document, espace, invitation, TYPES_DE_DOCUMENT, user } from "../src/schema.ts";
import { ouvrirBaseEmbarquee, ouvrirBaseEmbarqueeMigree, type BaseEmbarquee } from "./essai.ts";

const ETAT_F_011 = fileURLToPath(new URL("./migrations-essai/etat-f-011", import.meta.url));
const DESCENTE = fileURLToPath(new URL("../descentes/0002_documents.sql", import.meta.url));
const PHRASE_D_ECHEC = "La migration a échoué : aucune migration de ce lancement n'est appliquée.";
const TABLES_DE_F_011 = [
  "account",
  "adhesion",
  "espace",
  "invitation",
  "session",
  "user",
  "verification",
];
const SUIVI_DE_F_011 = journal.entries.slice(0, 2).map((entree) => String(entree.when));
const SUIVI_APRES_MONTEE = journal.entries.map((entree) => String(entree.when));
const ESPACE_A = "3c4d5e6f-7a8b-4c9d-8e0f-1a2b3c4d5e01";
const ESPACE_B = "3c4d5e6f-7a8b-4c9d-8e0f-1a2b3c4d5e02";
const INCONNU = "3c4d5e6f-7a8b-4c9d-8e0f-1a2b3c4d5eff";
const PAGE = "9e8d7c6b-5a4f-4e3d-9c2b-1a0f9e8d7c01";
const MAINTENANT = new Date("2026-10-14T10:00:00.000Z");
const EXPIRE_LE = new Date("2026-10-21T10:00:00.000Z");
const INSTANTANE = Uint8Array.from([0, 255, 92, 39, 34]);
// Chaque base embarquée est une instance PGlite neuve ; la première du fichier compile le
// WebAssembly et fait un initdb, plusieurs secondes quand toute la suite tourne en parallèle.
// Un test qui ouvre sa base dans son corps a donc ce délai explicite, comme dans
// `espaces-migration.test.ts`.
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

const tablesPubliques = (db: Db) =>
  valeurs(db, sql`select tablename from pg_tables where schemaname = 'public' order by tablename`);

const suivi = (db: Db) =>
  valeurs(db, sql`select created_at::text from drizzle.__drizzle_migrations order by id`);

const colonnes = (db: Db) =>
  valeurs(
    db,
    sql`select table_name || '.' || column_name || ' ' || data_type
          || case when is_nullable = 'NO' then ' not null' else '' end
          || coalesce(' default ' || column_default, '')
          || coalesce(' generated ' || generation_expression, '')
        from information_schema.columns
        where table_schema = 'public' and table_name = 'document'
        order by ordinal_position`,
  );

const contraintes = (db: Db) =>
  valeurs(
    db,
    sql`select conname || ' : ' || pg_get_constraintdef(oid) from pg_constraint
        where connamespace = 'public'::regnamespace and contype <> 'n'
        and conrelid::regclass::text = 'document' order by conname`,
  );

const indexAjoutes = (db: Db) =>
  valeurs(
    db,
    sql`select indexdef from pg_indexes where schemaname = 'public' and tablename = 'document'
        and indexname not in (select conname from pg_constraint) order by indexname`,
  );

// Le nom de la contrainte, ou à défaut le code SQLSTATE, de l'erreur du moteur.
async function refusDe(ecriture: Promise<unknown>): Promise<unknown> {
  const issue: unknown = await ecriture.then(
    () => "l'écriture a abouti",
    (erreur: unknown) => erreur,
  );
  expect(issue).toBeInstanceOf(Error);
  const moteur = ((issue as Error).cause ?? issue) as { constraint?: unknown; code?: unknown };
  return moteur.constraint ?? moteur.code;
}

const COLONNES_ATTENDUES = [
  "document.idEspace uuid not null",
  "document.type text not null",
  "document.idDocument uuid not null",
  "document.instantane bytea not null",
  "document.taille integer not null generated octet_length(instantane)",
  "document.enregistreLe timestamp with time zone not null",
];

const CONTRAINTES_ATTENDUES = [
  `document_espace_de_son_espace : CHECK (((type <> 'espace'::text) OR ("idDocument" = "idEspace")))`,
  'document_idEspace_espace_id_fk : FOREIGN KEY ("idEspace") REFERENCES espace(id) ON DELETE CASCADE',
  'document_pkey : PRIMARY KEY ("idEspace", type, "idDocument")',
  "document_type_valide : CHECK ((type = ANY (ARRAY['espace'::text, 'page'::text, 'table'::text])))",
];

// La clé primaire (espace, type, identifiant) indexe la clé étrangère vers l'espace et le décompte
// des documents d'un espace : aucun index en plus.
const INDEX_ATTENDUS: string[] = [];

async function constaterLaStructure(db: Db): Promise<void> {
  expect(await tablesPubliques(db)).toEqual([...TABLES_DE_F_011, "document"].sort());
  expect(await colonnes(db)).toEqual(COLONNES_ATTENDUES);
  expect(await contraintes(db)).toEqual(CONTRAINTES_ATTENDUES);
  expect(await indexAjoutes(db)).toEqual(INDEX_ATTENDUS);
  expect(await suivi(db)).toEqual(SUIVI_APRES_MONTEE);
}

// Ce que F-011 laisse dans une base : un compte, deux espaces, leurs adhésions, une invitation.
async function peuplerF011(db: Db): Promise<string> {
  const [compte] = await db
    .insert(user)
    .values({ name: "Anne", email: "anne@exemple.test" })
    .returning({ id: user.id });
  const idCompte = compte?.id ?? "";
  await db.insert(espace).values([
    { id: ESPACE_A, nom: "A" },
    { id: ESPACE_B, nom: "B" },
  ]);
  await db.insert(adhesion).values([
    { idEspace: ESPACE_A, idCompte, role: "proprietaire" },
    { idEspace: ESPACE_B, idCompte, role: "editeur" },
  ]);
  await db.insert(invitation).values({
    idEspace: ESPACE_A,
    role: "lecteur",
    empreinte: "d".repeat(64),
    creeLe: MAINTENANT,
    expireLe: EXPIRE_LE,
  });
  return idCompte;
}

async function contenuDeF011(db: Db) {
  return {
    comptes: await db.select({ id: user.id }).from(user),
    espaces: await db.select().from(espace).orderBy(espace.id),
    adhesions: await db.select().from(adhesion).orderBy(adhesion.idEspace),
    invitations: await db.select({ empreinte: invitation.empreinte }).from(invitation),
  };
}

async function baseDeF011(): Promise<BaseEmbarquee> {
  const embarquee = await ouvrirBaseEmbarquee();
  expect(await lancer(embarquee, ETAT_F_011)).toEqual({ code: 0, lignes: [] });
  await peuplerF011(embarquee.base.db);
  return embarquee;
}

const ecrireDocument = (db: Db, valeurs: Partial<typeof document.$inferInsert> = {}) =>
  db.insert(document).values({
    idEspace: ESPACE_A,
    type: "page",
    idDocument: PAGE,
    instantane: INSTANTANE,
    enregistreLe: MAINTENANT,
    ...valeurs,
  });

describe("migration des documents", () => {
  it(
    "F-012-AC28 F-008-AC15 sur une base peuplée à l'état laissé par F-011 la commande crée la table des documents, laisse comptes et espaces intacts, la consigne, et relancée n'en réapplique aucune",
    async () => {
      const embarquee = await baseDeF011();
      const { db } = embarquee.base;
      expect(await tablesPubliques(db)).toEqual(TABLES_DE_F_011);
      expect(await suivi(db)).toEqual(SUIVI_DE_F_011);
      for (const fichier of ["0000_comptes.sql", "0001_espaces.sql"]) {
        expect(readFileSync(`${ETAT_F_011}/${fichier}`, "utf8")).toBe(
          readFileSync(`${DOSSIER_MIGRATIONS}/${fichier}`, "utf8"),
        );
      }
      const avant = await contenuDeF011(db);

      expect(await lancer(embarquee, DOSSIER_MIGRATIONS)).toEqual({ code: 0, lignes: [] });
      await constaterLaStructure(db);
      expect(await contenuDeF011(db)).toEqual(avant);
      expect(await db.$count(document)).toBe(0);

      expect(await lancer(embarquee, DOSSIER_MIGRATIONS)).toEqual({ code: 0, lignes: [] });
      await constaterLaStructure(db);
      await embarquee.base.fermer();
    },
    DELAI_D_OUVERTURE_D_UNE_BASE_MS,
  );

  it(
    "F-012-AC28 F-008-AC16 si la migration des documents échoue, rien de ce lancement n'est appliqué, la base de F-011 reste intacte, et la relance après correction applique tout",
    async () => {
      const embarquee = await baseDeF011();
      const { db } = embarquee.base;
      const avant = await contenuDeF011(db);
      await db.execute(sql`create table "document" (obstacle integer)`);

      const defaillant = await lancer(embarquee, DOSSIER_MIGRATIONS);

      expect(defaillant.code).toBe(1);
      expect(defaillant.lignes[0]).toBe(PHRASE_D_ECHEC);
      expect(defaillant.lignes.slice(1).join(" | ")).toMatch(/document.*already exists/);
      expect(await colonnes(db)).toEqual(["document.obstacle integer"]);
      expect(await suivi(db)).toEqual(SUIVI_DE_F_011);
      expect(await contenuDeF011(db)).toEqual(avant);

      await db.execute(sql`drop table "document"`);
      expect(await lancer(embarquee, DOSSIER_MIGRATIONS)).toEqual({ code: 0, lignes: [] });
      await constaterLaStructure(db);
      await embarquee.base.fermer();
    },
    DELAI_D_OUVERTURE_D_UNE_BASE_MS,
  );

  it(
    "F-012-AC28 F-011-AC30 sur une base vide les trois migrations passent dans un seul lancement",
    async () => {
      const embarquee = await ouvrirBaseEmbarquee();
      expect(await lancer(embarquee, DOSSIER_MIGRATIONS)).toEqual({ code: 0, lignes: [] });
      await constaterLaStructure(embarquee.base.db);
      await embarquee.base.fermer();
    },
    DELAI_D_OUVERTURE_D_UNE_BASE_MS,
  );

  it(
    "F-012-AC28 la descente ramène une base peuplée, documents compris, à l'état laissé par F-011, comptes et espaces intacts, et la commande réapplique ensuite la migration",
    async () => {
      const embarquee = await baseDeF011();
      const { db } = embarquee.base;
      expect(await lancer(embarquee, DOSSIER_MIGRATIONS)).toEqual({ code: 0, lignes: [] });
      await ecrireDocument(db);
      await ecrireDocument(db, { type: "espace", idDocument: ESPACE_A });
      const avant = await contenuDeF011(db);
      const instructions = readFileSync(DESCENTE, "utf8")
        .split("--> statement-breakpoint")
        .map((instruction) => instruction.replace(/^--.*$/gm, "").trim());
      expect(instructions).toHaveLength(2);
      expect(instructions.at(-1)).toContain(String(journal.entries[2]?.when));

      await db.transaction(async (transaction) => {
        for (const instruction of instructions) {
          await transaction.execute(sql.raw(instruction));
        }
      });

      expect(await tablesPubliques(db)).toEqual(TABLES_DE_F_011);
      expect(await suivi(db)).toEqual(SUIVI_DE_F_011);
      expect(await contenuDeF011(db)).toEqual(avant);
      expect(await lancer(embarquee, DOSSIER_MIGRATIONS)).toEqual({ code: 0, lignes: [] });
      await constaterLaStructure(db);
      expect(await db.$count(document)).toBe(0);
      await embarquee.base.fermer();
    },
    DELAI_D_OUVERTURE_D_UNE_BASE_MS,
  );
});

describe("schéma et contraintes des documents", () => {
  it("F-012-AC28 les types contraints en base sont ceux du schéma, et dans le même ordre", () => {
    expect(TYPES_DE_DOCUMENT).toEqual(["espace", "page", "table"]);
    const ligne = CONTRAINTES_ATTENDUES.find((c) => c.startsWith("document_type_valide"));
    expect([...(ligne ?? "").matchAll(/'(\w+)'::text/g)].map((m) => m[1])).toEqual([
      ...TYPES_DE_DOCUMENT,
    ]);
  });

  it(
    "F-012-AC28 chaque colonne du schéma Drizzle de la table des documents existe en base sous le nom de sa propriété, et rien de plus",
    async () => {
      const { base } = await ouvrirBaseEmbarqueeMigree();
      expect(getTableName(document)).toBe("document");
      const duSchema = Object.entries(getTableColumns(document)).map(([propriete, colonne]) => {
        expect(colonne.name).toBe(propriete);
        return `document.${propriete}`;
      });
      expect(duSchema).toEqual(COLONNES_ATTENDUES.map((ligne) => ligne.split(" ")[0]));
      expect(await colonnes(base.db)).toEqual(COLONNES_ATTENDUES);
      await base.fermer();
    },
    DELAI_D_OUVERTURE_D_UNE_BASE_MS,
  );

  it(
    "F-012-AC28 F-012-AC8 la base refuse un type hors liste, un document d'espace qui ne porte pas l'identifiant de son espace, un espace inconnu, une clé en double, un instantané ou une date absents, et une taille écrite à la main",
    async () => {
      const { base } = await ouvrirBaseEmbarqueeMigree();
      const { db } = base;
      await peuplerF011(db);
      await ecrireDocument(db);

      expect(
        await refusDe(
          db.execute(
            sql`insert into document ("idEspace", type, "idDocument", instantane, "enregistreLe")
                values (${ESPACE_A}, 'image', ${PAGE}, '\\x00', now())`,
          ),
        ),
      ).toBe("document_type_valide");
      expect(await refusDe(ecrireDocument(db, { type: "espace", idDocument: PAGE }))).toBe(
        "document_espace_de_son_espace",
      );
      expect(await refusDe(ecrireDocument(db, { type: "espace", idDocument: ESPACE_B }))).toBe(
        "document_espace_de_son_espace",
      );
      expect(await refusDe(ecrireDocument(db, { idEspace: INCONNU }))).toBe(
        "document_idEspace_espace_id_fk",
      );
      expect(await refusDe(ecrireDocument(db))).toBe("document_pkey");
      expect(
        await refusDe(
          db.execute(
            sql`insert into document ("idEspace", type, "idDocument", "enregistreLe")
                values (${ESPACE_B}, 'page', ${PAGE}, now())`,
          ),
        ),
      ).toBe("23502");
      expect(
        await refusDe(
          db.execute(
            sql`insert into document ("idEspace", type, "idDocument", instantane)
                values (${ESPACE_B}, 'page', ${PAGE}, '\\x00')`,
          ),
        ),
      ).toBe("23502");
      // 428C9 : une colonne générée n'accepte aucune valeur écrite.
      expect(await refusDe(db.execute(sql`update document set taille = 1`))).toBe("428C9");

      // Le même identifiant sous un autre type ou dans un autre espace est un autre document.
      await ecrireDocument(db, { type: "table" });
      await ecrireDocument(db, { idEspace: ESPACE_B });
      await ecrireDocument(db, { type: "espace", idDocument: ESPACE_A });
      expect(await db.$count(document)).toBe(4);
      expect(await valeurs(db, sql`select distinct taille from document`)).toEqual([
        INSTANTANE.byteLength,
      ]);
      await base.fermer();
    },
    DELAI_D_OUVERTURE_D_UNE_BASE_MS,
  );

  it(
    "F-012-AC28 F-012-AC31 supprimer un espace emporte ses documents, rien de lisible n'en reste ; supprimer un compte laisse les documents des espaces",
    async () => {
      const { base } = await ouvrirBaseEmbarqueeMigree();
      const { db } = base;
      const idCompte = await peuplerF011(db);
      await ecrireDocument(db);
      await ecrireDocument(db, { type: "espace", idDocument: ESPACE_A });
      await ecrireDocument(db, { idEspace: ESPACE_B });

      await db.delete(espace).where(eq(espace.id, ESPACE_A));

      expect(await db.select({ idEspace: document.idEspace }).from(document)).toEqual([
        { idEspace: ESPACE_B },
      ]);
      expect(
        await valeurs(
          db,
          sql`select count(*)::int from document d left join espace e on e.id = d."idEspace" where e.id is null`,
        ),
      ).toEqual([0]);

      await db.delete(user).where(eq(user.id, idCompte));
      expect(await db.$count(document)).toBe(1);
      await base.fermer();
    },
    DELAI_D_OUVERTURE_D_UNE_BASE_MS,
  );
});
