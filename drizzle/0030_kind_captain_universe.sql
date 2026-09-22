CREATE TABLE "product_releases" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"version" varchar(40) NOT NULL,
	"title" varchar(160),
	"changelog" text,
	"release_notes_url" text,
	"is_current" boolean DEFAULT false NOT NULL,
	"released_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "email_verification_token" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "email_verification_expiry" timestamp;--> statement-breakpoint
ALTER TABLE "developers" ADD COLUMN "email_verification_token" text;--> statement-breakpoint
ALTER TABLE "developers" ADD COLUMN "email_verification_expiry" timestamp;--> statement-breakpoint
ALTER TABLE "product_releases" ADD CONSTRAINT "product_releases_product_id_developer_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."developer_products"("id") ON DELETE no action ON UPDATE no action;