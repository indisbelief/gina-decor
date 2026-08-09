CREATE TABLE "app_config" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shopify_sales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" text NOT NULL,
	"order_name" text NOT NULL,
	"line_item_id" text NOT NULL,
	"title" text NOT NULL,
	"price" numeric(10, 2),
	"quantity" integer DEFAULT 1 NOT NULL,
	"handle" text,
	"order_date" date,
	"item_id" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "kanaal" text;--> statement-breakpoint
ALTER TABLE "shopify_sales" ADD CONSTRAINT "shopify_sales_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "shopify_sales_order_line_idx" ON "shopify_sales" USING btree ("order_id","line_item_id");