// Base PostgreSQL embarquée des tests (ADR-0005, F-008-AC18) : une instance PGlite en mémoire
// par appel, jamais partagée, sans fichier ni port. PGlite n'entre que par la couture `Pilote`.
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

import { creerBase, schemaComptes, type Base, type Pilote } from "../src/acces.ts";
import { DOSSIER_MIGRATIONS } from "../src/migration.ts";

export interface BaseEmbarquee {
  readonly base: Base;
  readonly pilote: Pilote;
}

export async function ouvrirBaseEmbarquee(): Promise<BaseEmbarquee> {
  const moteur = new PGlite();
  await moteur.waitReady;
  const db = drizzle(moteur, { schema: schemaComptes });
  const pilote: Pilote = {
    db,
    appliquerMigrations: (dossier) => migrate(db, { migrationsFolder: dossier }),
    fermer: () => moteur.close(),
  };
  return { base: creerBase(pilote), pilote };
}

// La même base, une fois les migrations réelles du paquet appliquées : celle des tests qui lisent
// ou écrivent des comptes, dans `packages/db` comme dans `apps/server`.
export async function ouvrirBaseEmbarqueeMigree(): Promise<BaseEmbarquee> {
  const embarquee = await ouvrirBaseEmbarquee();
  await embarquee.pilote.appliquerMigrations(DOSSIER_MIGRATIONS);
  return embarquee;
}
