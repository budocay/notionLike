-- Descente de migrations/0000_comptes.sql (F-009-AC21) : ramène la base à l'état laissé par F-008.
-- DESTRUCTIVE : tous les comptes, sessions et mots de passe sont perdus. Sauvegarder d'abord
-- (pg_dump --schema=public --schema=drizzle), puis lancer dans une seule transaction :
--   psql --single-transaction --set ON_ERROR_STOP=1 --file packages/db/descentes/0000_comptes.sql
-- La dernière instruction retire la ligne de suivi : la commande de migration réapplique ensuite
-- 0000_comptes. Son horodatage est le champ `when` de l'entrée dans migrations/meta/_journal.json.
DROP TABLE "verification";
--> statement-breakpoint
DROP TABLE "session";
--> statement-breakpoint
DROP TABLE "account";
--> statement-breakpoint
DROP TABLE "user";
--> statement-breakpoint
DELETE FROM "drizzle"."__drizzle_migrations" WHERE "created_at" = 1791788855241;
