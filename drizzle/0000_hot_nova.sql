CREATE TYPE "public"."staat" AS ENUM('nieuw', 'als_nieuw', 'gebruikt');--> statement-breakpoint
CREATE TYPE "public"."status" AS ENUM('voorraad', 'verkocht', 'gereserveerd');--> statement-breakpoint
CREATE TABLE "items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sku" text NOT NULL,
	"merk" text NOT NULL,
	"model" text,
	"soort" text,
	"aantal_delen" integer,
	"staat" "staat",
	"locatie" text,
	"inkoopprijs" numeric(10, 2),
	"vraagprijs" numeric(10, 2),
	"verkoopprijs" numeric(10, 2),
	"inkoopdatum" date,
	"verkoopdatum" date,
	"leverancier" text,
	"status" "status" DEFAULT 'voorraad' NOT NULL,
	"notities" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "items_sku_unique" UNIQUE("sku")
);
--> statement-breakpoint
CREATE TABLE "photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"url" text NOT NULL,
	"volgorde" integer DEFAULT 0 NOT NULL,
	"is_hoofdfoto" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;