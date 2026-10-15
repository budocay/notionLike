-- Descente de migrations/0002_documents.sql (F-012-AC28) : ramène la base à l'état laissé par F-011.
-- DESTRUCTIVE : tous les instantanés des documents stockés par le serveur sont perdus ; comptes,
-- sessions, espaces, adhésions et invitations restent. Arrêter le serveur, puis sauvegarder d'abord
-- (pg_dump --schema=public --schema=drizzle), puis lancer dans une seule transaction :
--   psql --single-transaction --set ON_ERROR_STOP=1 --file packages/db/descentes/0002_documents.sql
-- La dernière instruction retire la ligne de suivi : la commande de migration réapplique ensuite
-- 0002_documents. Son horodatage est le champ `when` de l'entrée dans migrations/meta/_journal.json.
-- Pour revenir à l'état laissé par F-009, lancer ensuite descentes/0001_espaces.sql.
DROP TABLE "document";
--> statement-breakpoint
DELETE FROM "drizzle"."__drizzle_migrations" WHERE "created_at" = 1791981700761;
