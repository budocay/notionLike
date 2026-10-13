-- Descente de migrations/0001_espaces.sql (F-011-AC30) : ramène la base à l'état laissé par F-009.
-- DESTRUCTIVE : tous les espaces, adhésions et invitations sont perdus ; les comptes et sessions
-- restent. Sauvegarder d'abord (pg_dump --schema=public --schema=drizzle), puis lancer dans une
-- seule transaction :
--   psql --single-transaction --set ON_ERROR_STOP=1 --file packages/db/descentes/0001_espaces.sql
-- La dernière instruction retire la ligne de suivi : la commande de migration réapplique ensuite
-- 0001_espaces. Son horodatage est le champ `when` de l'entrée dans migrations/meta/_journal.json.
-- Pour revenir à l'état laissé par F-008, lancer ensuite descentes/0000_comptes.sql.
DROP TABLE "invitation";
--> statement-breakpoint
DROP TABLE "adhesion";
--> statement-breakpoint
DROP TABLE "espace";
--> statement-breakpoint
DELETE FROM "drizzle"."__drizzle_migrations" WHERE "created_at" = 1791876641231;
