CREATE TABLE "adhesion" (
	"idEspace" uuid NOT NULL,
	"idCompte" uuid NOT NULL,
	"role" text NOT NULL,
	CONSTRAINT "adhesion_pkey" PRIMARY KEY("idEspace","idCompte"),
	CONSTRAINT "adhesion_role_valide" CHECK ("adhesion"."role" in ('proprietaire', 'editeur', 'lecteur'))
);
--> statement-breakpoint
CREATE TABLE "espace" (
	"id" uuid PRIMARY KEY NOT NULL,
	"nom" text NOT NULL,
	CONSTRAINT "espace_nom_longueur" CHECK (char_length("espace"."nom") between 1 and 100)
);
--> statement-breakpoint
CREATE TABLE "invitation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idEspace" uuid NOT NULL,
	"role" text NOT NULL,
	"empreinte" text NOT NULL,
	"creeLe" timestamp with time zone NOT NULL,
	"expireLe" timestamp with time zone NOT NULL,
	"accepteeLe" timestamp with time zone,
	"revoqueeLe" timestamp with time zone,
	CONSTRAINT "invitation_empreinte_unique" UNIQUE("empreinte"),
	CONSTRAINT "invitation_role_invitable" CHECK ("invitation"."role" in ('editeur', 'lecteur')),
	CONSTRAINT "invitation_empreinte_sha256" CHECK ("invitation"."empreinte" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "invitation_expire_apres_creation" CHECK ("invitation"."expireLe" > "invitation"."creeLe"),
	CONSTRAINT "invitation_un_seul_denouement" CHECK ("invitation"."accepteeLe" is null or "invitation"."revoqueeLe" is null)
);
--> statement-breakpoint
ALTER TABLE "adhesion" ADD CONSTRAINT "adhesion_idEspace_espace_id_fk" FOREIGN KEY ("idEspace") REFERENCES "public"."espace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adhesion" ADD CONSTRAINT "adhesion_idCompte_user_id_fk" FOREIGN KEY ("idCompte") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_idEspace_espace_id_fk" FOREIGN KEY ("idEspace") REFERENCES "public"."espace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "adhesion_idCompte_idx" ON "adhesion" USING btree ("idCompte");--> statement-breakpoint
CREATE INDEX "invitation_idEspace_idx" ON "invitation" USING btree ("idEspace");