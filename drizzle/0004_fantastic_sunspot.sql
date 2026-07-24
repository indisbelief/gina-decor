ALTER TABLE "items" ADD COLUMN "shopify_handle" text;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "shopify_sync" jsonb;--> statement-breakpoint
ALTER TABLE "photos" ADD COLUMN "source_url" text;