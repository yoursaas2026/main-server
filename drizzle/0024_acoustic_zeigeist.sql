CREATE TABLE "client_listing_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"event_type" varchar(24) NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "account_type" varchar(20);--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "buyer_role" varchar(80);--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "company_size" varchar(32);--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "primary_goals" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "interested_category_ids" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "budget_band" varchar(24);--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "timeline" varchar(24);--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "technical_comfort" varchar(32);--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "problem_statement" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "preferred_stacks" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "saved_product_ids" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "onboarding_completed_at" timestamp;--> statement-breakpoint
ALTER TABLE "client_listing_events" ADD CONSTRAINT "client_listing_events_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_listing_events" ADD CONSTRAINT "client_listing_events_product_id_developer_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."developer_products"("id") ON DELETE no action ON UPDATE no action;