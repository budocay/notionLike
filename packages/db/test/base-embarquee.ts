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

// Ouvrir une instance neuve coûte un initdb complet, 1,6 à 2,3 s mesurés seul sur 4 CPU, bien
// davantage quand toute la suite tourne en parallèle. Le répertoire de données de la première
// instance du module est copié en mémoire avant qu'elle ne serve, puis chaque instance suivante
// démarre d'une copie de ce gabarit (0,3 s mesurées) : chacune a toujours son propre répertoire,
// rien n'est partagé entre deux instances, ni écrit sur disque. Le gabarit vit dans le module,
// donc dans un seul fichier de test : deux fichiers ou deux exécutions ne se le partagent pas.
let gabarit: Promise<Blob> | undefined;

async function ouvrirMoteur(): Promise<PGlite> {
  if (gabarit !== undefined) {
    const moteur = new PGlite({ loadDataDir: await gabarit });
    await moteur.waitReady;
    return moteur;
  }
  const moteur = new PGlite();
  const prise = moteur.waitReady.then(() => moteur.dumpDataDir("none"));
  gabarit = prise;
  try {
    await prise;
  } catch (erreur) {
    gabarit = undefined;
    await moteur.close().catch(() => undefined);
    throw erreur;
  }
  return moteur;
}

export async function ouvrirBaseEmbarquee(): Promise<BaseEmbarquee> {
  const moteur = await ouvrirMoteur();
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
