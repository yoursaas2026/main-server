CREATE TABLE "glass_breaker_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"admin_id" integer NOT NULL,
	"action" varchar(64) NOT NULL,
	"target_type" varchar(40) NOT NULL,
	"target_id" integer NOT NULL,
	"reason" text NOT NULL,
	"before_json" text,
	"after_json" text,
	"meta_json" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "glass_breaker_events" ADD CONSTRAINT "glass_breaker_events_admin_id_admins_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE no action ON UPDATE no action;