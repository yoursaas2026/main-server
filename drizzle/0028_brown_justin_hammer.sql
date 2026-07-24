ALTER TABLE "client_listing_events" ADD COLUMN "surface" varchar(40);--> statement-breakpoint
ALTER TABLE "client_listing_events" ADD COLUMN "query_id" varchar(64);--> statement-breakpoint
ALTER TABLE "client_listing_events" ADD COLUMN "session_id" varchar(64);--> statement-breakpoint
ALTER TABLE "client_listing_events" ADD COLUMN "meta" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "pain_points" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "preferred_integrations" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "current_tools" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "interest_profile" text;