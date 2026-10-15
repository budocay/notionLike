// Schéma des comptes (F-009-AC21, H3) : le modèle de données de better-auth, sans renommage. Les
// noms de tables, de propriétés et de colonnes sont ceux de better-auth (`emailVerified`,
// `expiresAt`), parce que son adaptateur retrouve chaque champ par le nom de sa propriété. Dans une
// requête SQL écrite à la main, ces colonnes se citent entre guillemets doubles.
// Les migrations sont produites depuis ce fichier, relues puis passées par Prettier (H19) :
//   pnpm --filter @notionlike/db exec drizzle-kit generate --dialect postgresql \
//     --schema src/schema.ts --out migrations --name <nom>
import { sql, type SQL } from "drizzle-orm";
import {
  boolean,
  check,
  customType,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

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

// Espaces, adhésions et invitations (F-011-AC30). Noms français, colonnes du nom de leur propriété,
// citées entre guillemets doubles dans une requête écrite à la main. Les rôles sont contraints en
// base aux valeurs de F-011 H1 ; la liste publiée par `packages/contrats` doit rester la même
// (couture tenue côté serveur, ce paquet n'important pas les contrats).
export const ROLES = ["proprietaire", "editeur", "lecteur"] as const;
export const ROLES_INVITABLES = ["editeur", "lecteur"] as const;

// L'identifiant est fourni par le client (F-011 H3) : aucune valeur par défaut. Le nom ne porte ici
// que sa longueur (1 à 100 caractères) ; le refus d'un nom fait de blancs est celui du contrat.
export const espace = pgTable(
  "espace",
  {
    id: uuid().primaryKey(),
    nom: text().notNull(),
  },
  (table) => [check("espace_nom_longueur", sql`char_length(${table.nom}) between 1 and 100`)],
);

const idDeLEspace = () =>
  uuid()
    .notNull()
    .references(() => espace.id, { onDelete: "cascade" });

// La clé primaire (espace, compte) sert d'index à la clé étrangère vers l'espace, qui en est la
// première colonne ; celle vers le compte a son propre index. Un compte supprimé emporte ses
// adhésions (effacement d'un compte, F-008).
export const adhesion = pgTable(
  "adhesion",
  {
    idEspace: idDeLEspace(),
    idCompte: idDuCompte(),
    role: text({ enum: ROLES }).notNull(),
  },
  (table) => [
    primaryKey({ name: "adhesion_pkey", columns: [table.idEspace, table.idCompte] }),
    index("adhesion_idCompte_idx").on(table.idCompte),
    // Les valeurs sont écrites en toutes lettres, sans construction de texte SQL ; `espaces.test.ts`
    // constate qu'elles sont celles de `ROLES`.
    check("adhesion_role_valide", sql`${table.role} in ('proprietaire', 'editeur', 'lecteur')`),
  ],
);

// Le jeton n'est jamais écrit : seule son empreinte SHA-256, en hexadécimal (F-011-AC19). Les dates
// sont fournies par l'appelant, dont l'horloge est injectable (F-011 H10). Une invitation est en
// attente tant qu'elle n'est ni acceptée, ni révoquée, ni expirée.
export const invitation = pgTable(
  "invitation",
  {
    id: uuid().primaryKey().defaultRandom(),
    idEspace: idDeLEspace(),
    role: text({ enum: ROLES_INVITABLES }).notNull(),
    empreinte: text().notNull().unique(),
    creeLe: instant().notNull(),
    expireLe: instant().notNull(),
    accepteeLe: instant(),
    revoqueeLe: instant(),
  },
  (table) => [
    index("invitation_idEspace_idx").on(table.idEspace),
    check("invitation_role_invitable", sql`${table.role} in ('editeur', 'lecteur')`),
    check("invitation_empreinte_sha256", sql`${table.empreinte} ~ '^[0-9a-f]{64}$'`),
    check("invitation_expire_apres_creation", sql`${table.expireLe} > ${table.creeLe}`),
    check(
      "invitation_un_seul_denouement",
      sql`${table.accepteeLe} is null or ${table.revoqueeLe} is null`,
    ),
  ],
);

// Documents synchronisés par le serveur (F-012-AC28, H3) : un instantané Yjs par document, encodé
// au format V1, remplacé à chaque enregistrement. Les types sont contraints en base aux valeurs de
// F-012 H2 ; la liste publiée par `packages/contrats` doit rester la même (couture tenue côté
// serveur, ce paquet n'important pas les contrats).
export const TYPES_DE_DOCUMENT = ["espace", "page", "table"] as const;

// Drizzle 0.45.3 n'a pas de colonne binaire (`MEMORY/VEILLE.md`, « PGlite et Drizzle — colonnes
// binaires ») : le type est déclaré ici, sans conversion. PGlite rend un `Uint8Array`, le pilote
// `pg` un `Buffer`, qui en est une sous-classe ; les deux acceptent un `Uint8Array` à l'écriture.
const octets = customType<{ data: Uint8Array; driverData: Uint8Array }>({
  dataType: () => "bytea",
});

// La clé primaire (espace, type, identifiant) sert d'index à la clé étrangère vers l'espace, qui en
// est la première colonne, et au décompte des documents d'un espace (F-012-AC24). Le document d'un
// espace porte l'identifiant de son espace : un seul par espace. Supprimer l'espace emporte ses
// documents (F-012-AC31). La taille est calculée par la base, elle ne peut pas diverger de
// l'instantané ; la date est fournie par l'appelant, dont l'horloge est injectable.
export const document = pgTable(
  "document",
  {
    idEspace: idDeLEspace(),
    type: text({ enum: TYPES_DE_DOCUMENT }).notNull(),
    idDocument: uuid().notNull(),
    instantane: octets().notNull(),
    taille: integer()
      .notNull()
      .generatedAlwaysAs((): SQL => sql`octet_length(${document.instantane})`),
    enregistreLe: instant().notNull(),
  },
  (table) => [
    primaryKey({
      name: "document_pkey",
      columns: [table.idEspace, table.type, table.idDocument],
    }),
    // Écrites en toutes lettres ; `documents-migration.test.ts` constate qu'elles sont celles de
    // `TYPES_DE_DOCUMENT`.
    check("document_type_valide", sql`${table.type} in ('espace', 'page', 'table')`),
    check(
      "document_espace_de_son_espace",
      sql`${table.type} <> 'espace' or ${table.idDocument} = ${table.idEspace}`,
    ),
  ],
);
