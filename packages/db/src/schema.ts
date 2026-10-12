// Schéma des comptes (F-009-AC21, H3) : le modèle de données de better-auth, sans renommage. Les
// noms de tables, de propriétés et de colonnes sont ceux de better-auth (`emailVerified`,
// `expiresAt`), parce que son adaptateur retrouve chaque champ par le nom de sa propriété. Dans une
// requête SQL écrite à la main, ces colonnes se citent entre guillemets doubles.
// Les migrations sont produites depuis ce fichier, relues puis passées par Prettier (H19) :
//   pnpm --filter @notionlike/db exec drizzle-kit generate --dialect postgresql \
//     --schema src/schema.ts --out migrations --name <nom>
import { sql } from "drizzle-orm";
import { boolean, check, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

const instant = () => timestamp({ withTimezone: true });

// better-auth remplit lui-même les deux dates ; les valeurs par défaut servent aux écritures faites
// sans lui (H21).
const dates = {
  createdAt: instant().notNull().defaultNow(),
  updatedAt: instant()
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

// La contrainte tient F-009-AC2 en base : deux courriels qui ne diffèrent que par la casse ne
// peuvent pas coexister, même écrits sans passer par better-auth.
export const user = pgTable(
  "user",
  {
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull(),
    email: text().notNull().unique(),
    emailVerified: boolean().notNull().default(false),
    image: text(),
    ...dates,
  },
  (table) => [check("user_email_minuscules", sql`${table.email} = lower(${table.email})`)],
);

const idDuCompte = () =>
  uuid()
    .notNull()
    .references(() => user.id, { onDelete: "cascade" });

export const session = pgTable(
  "session",
  {
    id: uuid().primaryKey().defaultRandom(),
    expiresAt: instant().notNull(),
    token: text().notNull().unique(),
    ...dates,
    ipAddress: text(),
    userAgent: text(),
    userId: idDuCompte(),
  },
  (table) => [
    index("session_userId_idx").on(table.userId),
    // Absent du schéma natif : prépare la purge des sessions expirées (F-025).
    index("session_expiresAt_idx").on(table.expiresAt),
  ],
);

export const account = pgTable(
  "account",
  {
    id: uuid().primaryKey().defaultRandom(),
    accountId: text().notNull(),
    providerId: text().notNull(),
    userId: idDuCompte(),
    accessToken: text(),
    refreshToken: text(),
    idToken: text(),
    accessTokenExpiresAt: instant(),
    refreshTokenExpiresAt: instant(),
    scope: text(),
    password: text(),
    ...dates,
  },
  (table) => [index("account_userId_idx").on(table.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: uuid().primaryKey().defaultRandom(),
    identifier: text().notNull(),
    value: text().notNull(),
    expiresAt: instant().notNull(),
    ...dates,
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);
