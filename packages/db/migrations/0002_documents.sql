CREATE TABLE "document" (
	"idEspace" uuid NOT NULL,
	"type" text NOT NULL,
	"idDocument" uuid NOT NULL,
	"instantane" "bytea" NOT NULL,
	"taille" integer GENERATED ALWAYS AS (octet_length("document"."instantane")) STORED NOT NULL,
	"enregistreLe" timestamp with time zone NOT NULL,
	CONSTRAINT "document_pkey" PRIMARY KEY("idEspace","type","idDocument"),
	CONSTRAINT "document_type_valide" CHECK ("document"."type" in ('espace', 'page', 'table')),
	CONSTRAINT "document_espace_de_son_espace" CHECK ("document"."type" <> 'espace' or "document"."idDocument" = "document"."idEspace")
);
--> statement-breakpoint
ALTER TABLE "document" ADD CONSTRAINT "document_idEspace_espace_id_fk" FOREIGN KEY ("idEspace") REFERENCES "public"."espace"("id") ON DELETE cascade ON UPDATE no action;