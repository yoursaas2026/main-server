CREATE TABLE IF NOT EXISTS "developer_products" (
	"id" serial PRIMARY KEY NOT NULL,
	"developer_id" integer NOT NULL,
	"slug" varchar(160) NOT NULL,
	"name" text NOT NULL,
	"tagline" text,
	"short_description" text,
	"problem" text,
	"solution" text,
	"features_tagline" text,
	"features_about_body" text,
	"benefits" text,
	"features" text,
	"use_cases" text,
	"audience_tags" text,
	"customization_tiers" text,
	"trial_days" integer DEFAULT 0,
	"free_trial" boolean DEFAULT false,
	"deployment_time" text,
	"best_for" text,
	"technical_stack" text,
	"technical_deployment" text,
	"technical_integrations" text,
	"technical_platforms" text,
	"technical_api" text,
	"technical_security" text,
	"technical_compliance" text,
	"demo_url" text,
	"demo_user" text,
	"demo_password" text,
	"demo_video_id" text,
	"support_docs" text,
	"support_email" text,
	"support_chat" text,
	"support_response" text,
	"legal_privacy" text,
	"legal_terms" text,
	"legal_refund" text,
	"marketplace_customization" boolean DEFAULT true,
	"marketplace_white_label" boolean DEFAULT false,
	"marketplace_deployment_support" boolean DEFAULT false,
	"marketplace_onboarding_support" boolean DEFAULT false,
	"meta_version" text,
	"meta_release_notes_url" text,
	"meta_setup_time" text,
	"meta_difficulty" text,
	"meta_requirements" text,
	"trust_verified_listing" boolean DEFAULT false,
	"trust_verified_by_platform" boolean DEFAULT false,
	"listing_status" varchar(20) DEFAULT 'draft',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "developer_products_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "developers" ADD COLUMN IF NOT EXISTS "cover_picture" text;--> statement-breakpoint
ALTER TABLE "developers" ADD COLUMN IF NOT EXISTS "twitter_url" text;--> statement-breakpoint
ALTER TABLE "developers" ADD COLUMN IF NOT EXISTS "resume_url" text;--> statement-breakpoint
ALTER TABLE "developers" ADD COLUMN IF NOT EXISTS "headline" text;--> statement-breakpoint
ALTER TABLE "developers" ADD COLUMN IF NOT EXISTS "location" varchar(100);--> statement-breakpoint
ALTER TABLE "developers" ADD COLUMN IF NOT EXISTS "company" text;--> statement-breakpoint
ALTER TABLE "developers" ADD COLUMN IF NOT EXISTS "hourly_rate" integer;--> statement-breakpoint
ALTER TABLE "developers" ADD COLUMN IF NOT EXISTS "open_to_open_source" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "developers" ADD COLUMN IF NOT EXISTS "available_for_hire" boolean DEFAULT true;--> statement-breakpoint
ALTER TABLE "developers" ADD COLUMN IF NOT EXISTS "services_offered" text;--> statement-breakpoint
ALTER TABLE "developers" ADD COLUMN IF NOT EXISTS "past_experiences" text;--> statement-breakpoint
ALTER TABLE "developers" ADD COLUMN IF NOT EXISTS "portfolio_projects" text;--> statement-breakpoint
ALTER TABLE "developers" ADD COLUMN IF NOT EXISTS "block_reason" text;--> statement-breakpoint
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'developer_products_developer_id_developers_id_fk'
    ) THEN
        ALTER TABLE "developer_products"
        ADD CONSTRAINT "developer_products_developer_id_developers_id_fk"
        FOREIGN KEY ("developer_id") REFERENCES "public"."developers"("id")
        ON DELETE no action ON UPDATE no action;
    END IF;
END
$$;