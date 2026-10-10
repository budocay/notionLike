// Accès à la base (ADR-0005). `Pilote` est la couture entre les deux moteurs : le pilote `pg`
// en production, PGlite dans les tests (`test/base-embarquee.ts`). Il reste interne au paquet.
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { Pool, type PoolClient } from "pg";

import { ErreurBase } from "./erreurs.ts";
import { DELAI_SONDE_MS, sonderDansLeDelai } from "./sonde.ts";

export interface Base {
  readonly db: PgDatabase<PgQueryResultHKT, Record<string, never>>;
  sonder(): Promise<void>;
  fermer(): Promise<void>;
}

export interface Pilote {
  readonly db: Base["db"];
  // Applique, dans une seule transaction, les migrations du dossier qui ne le sont pas encore (H13).
  appliquerMigrations(dossier: string): Promise<void>;
  fermer(): Promise<void>;
}

const PROTOCOLES_ACCEPTES = ["postgres:", "postgresql:"];

// L'erreur d'analyse d'une URL porte l'URL : elle n'est pas transmise en `cause`.
function protocoleDe(url: string): string | undefined {
  try {
    return new URL(url).protocol;
  } catch {
    return undefined;
  }
}

function exigerUneUrlPostgres(url: string): void {
  const protocole = protocoleDe(url);
  if (protocole === undefined || !PROTOCOLES_ACCEPTES.includes(protocole)) {
    throw new ErreurBase("url-de-connexion-invalide");
  }
}

// Une connexion inactive coupée par la base (arrêt, redémarrage) émet `error` sur la réserve.
// Sans écouteur, le processus s'arrête. L'objet reçu porte le client `pg`, donc le mot de passe
// en clair : il n'est ni journalisé ni transmis. La sonde suivante dit si la base répond.
function ignorerLaConnexionInactivePerdue(): void {}

// Aucun des deux pilotes n'accepte d'être fermé deux fois : la fermeture est mémorisée, et tout
// appel suivant rend la même promesse sans rappeler le pilote.
export function creerBase(pilote: Pilote): Base {
  let fermeture: Promise<void> | undefined;
  return {
    db: pilote.db,
    sonder: () => sonderDansLeDelai(() => pilote.db.execute(sql`select 1`)),
    fermer: () => (fermeture ??= pilote.fermer()),
  };
}

// La réserve attend, pour se fermer, que chaque connexion empruntée soit rendue. La requête d'une
// sonde hors délai ne l'est jamais tant que la base se tait : à la fermeture, les connexions encore
// empruntées sont donc coupées. Le pilote `pg` détruit la socket d'un client dont une requête est
// en vol, ce qui la fait échouer et rend la connexion.
function fermerLaReserve(reserve: Pool, empruntees: ReadonlySet<PoolClient>): Promise<void> {
  const fermeture = reserve.end();
  for (const connexion of empruntees) {
    // La promesse rendue ne rejette jamais ; la fin de la fermeture est celle de la réserve.
    void connexion.end();
  }
  return fermeture;
}

export function ouvrirPilotePg(url: string): Pilote {
  exigerUneUrlPostgres(url);
  const reserve = new Pool({ connectionString: url, connectionTimeoutMillis: DELAI_SONDE_MS });
  const empruntees = new Set<PoolClient>();
  reserve.on("error", ignorerLaConnexionInactivePerdue);
  reserve.on("acquire", (connexion) => empruntees.add(connexion));
  reserve.on("release", (_erreur, connexion) => empruntees.delete(connexion));
  const db = drizzle(reserve);
  return {
    db,
    appliquerMigrations: (dossier) => migrate(db, { migrationsFolder: dossier }),
    fermer: () => fermerLaReserve(reserve, empruntees),
  };
}

export function ouvrirBase(url: string): Base {
  return creerBase(ouvrirPilotePg(url));
}
