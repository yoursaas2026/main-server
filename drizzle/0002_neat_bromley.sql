ALTER TABLE "clients" ALTER COLUMN "password" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "developers" ALTER COLUMN "password" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "admins" ADD COLUMN "reset_password_token" text;--> statement-breakpoint
ALTER TABLE "admins" ADD COLUMN "reset_password_expiry" timestamp;--> statement-breakpoint
ALTER TABLE "admins" ADD COLUMN "can_verify_kyc" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "admins" ADD COLUMN "is_email_verified" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "google_id" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "apple_id" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "microsoft_id" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "auth_provider" varchar(20) DEFAULT 'email';--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "reset_password_token" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "reset_password_expiry" timestamp;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "is_email_verified" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "is_phone_verified" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "developers" ADD COLUMN "google_id" text;--> statement-breakpoint
ALTER TABLE "developers" ADD COLUMN "apple_id" text;--> statement-breakpoint
ALTER TABLE "developers" ADD COLUMN "microsoft_id" text;--> statement-breakpoint
ALTER TABLE "developers" ADD COLUMN "auth_provider" varchar(20) DEFAULT 'email';--> statement-breakpoint
ALTER TABLE "developers" ADD COLUMN "reset_password_token" text;--> statement-breakpoint
ALTER TABLE "developers" ADD COLUMN "reset_password_expiry" timestamp;--> statement-breakpoint
ALTER TABLE "developers" ADD COLUMN "kyc_status" varchar(20) DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE "developers" ADD COLUMN "kyc_submitted_at" timestamp;--> statement-breakpoint
ALTER TABLE "developers" ADD COLUMN "kyc_verified_at" timestamp;--> statement-breakpoint
ALTER TABLE "developers" ADD COLUMN "kyc_rejected_at" timestamp;--> statement-breakpoint
ALTER TABLE "developers" ADD COLUMN "kyc_rejection_reason" text;--> statement-breakpoint
ALTER TABLE "developers" ADD COLUMN "full_legal_name" text;--> statement-breakpoint
ALTER TABLE "developers" ADD COLUMN "date_of_birth" timestamp;--> statement-breakpoint
ALTER TABLE "developers" ADD COLUMN "nationality" varchar(100);--> statement-breakpoint
ALTER TABLE "developers" ADD COLUMN "government_id_type" varchar(50);--> statement-breakpoint
ALTER TABLE "developers" ADD COLUMN "government_id_number" varchar(100);--> statement-breakpoint
ALTER TABLE "developers" ADD COLUMN "government_id_front_image" text;--> statement-breakpoint
ALTER TABLE "developers" ADD COLUMN "government_id_back_image" text;--> statement-breakpoint
ALTER TABLE "developers" ADD COLUMN "address_proof_type" varchar(50);--> statement-breakpoint
ALTER TABLE "developers" ADD COLUMN "address_proof_image" text;--> statement-breakpoint
ALTER TABLE "developers" ADD COLUMN "selfie_image" text;--> statement-breakpoint
ALTER TABLE "developers" ADD COLUMN "kyc_address" text;--> statement-breakpoint
ALTER TABLE "developers" ADD COLUMN "kyc_city" varchar(100);--> statement-breakpoint
ALTER TABLE "developers" ADD COLUMN "kyc_state" varchar(100);--> statement-breakpoint
ALTER TABLE "developers" ADD COLUMN "kyc_country" varchar(100);--> statement-breakpoint
ALTER TABLE "developers" ADD COLUMN "kyc_postal_code" varchar(20);--> statement-breakpoint
ALTER TABLE "developers" ADD COLUMN "is_email_verified" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "developers" ADD COLUMN "is_phone_verified" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "clients" DROP COLUMN "is_verified";--> statement-breakpoint
ALTER TABLE "developers" DROP COLUMN "is_verified";--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_google_id_unique" UNIQUE("google_id");--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_apple_id_unique" UNIQUE("apple_id");--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_microsoft_id_unique" UNIQUE("microsoft_id");--> statement-breakpoint
ALTER TABLE "developers" ADD CONSTRAINT "developers_google_id_unique" UNIQUE("google_id");--> statement-breakpoint
ALTER TABLE "developers" ADD CONSTRAINT "developers_apple_id_unique" UNIQUE("apple_id");--> statement-breakpoint
ALTER TABLE "developers" ADD CONSTRAINT "developers_microsoft_id_unique" UNIQUE("microsoft_id");