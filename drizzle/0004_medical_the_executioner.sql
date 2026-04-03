ALTER TABLE "admins" DROP CONSTRAINT "admins_username_unique";--> statement-breakpoint
ALTER TABLE "admins" ADD COLUMN "google_id" text;--> statement-breakpoint
ALTER TABLE "admins" DROP COLUMN "username";--> statement-breakpoint
ALTER TABLE "admins" DROP COLUMN "phone";--> statement-breakpoint
ALTER TABLE "admins" DROP COLUMN "password";--> statement-breakpoint
ALTER TABLE "admins" DROP COLUMN "reset_password_token";--> statement-breakpoint
ALTER TABLE "admins" DROP COLUMN "reset_password_expiry";--> statement-breakpoint
ALTER TABLE "admins" DROP COLUMN "role";--> statement-breakpoint
ALTER TABLE "admins" DROP COLUMN "permissions";--> statement-breakpoint
ALTER TABLE "admins" DROP COLUMN "is_super_admin";--> statement-breakpoint
ALTER TABLE "admins" DROP COLUMN "can_manage_developers";--> statement-breakpoint
ALTER TABLE "admins" DROP COLUMN "can_manage_clients";--> statement-breakpoint
ALTER TABLE "admins" DROP COLUMN "can_manage_admins";--> statement-breakpoint
ALTER TABLE "admins" DROP COLUMN "can_verify_kyc";--> statement-breakpoint
ALTER TABLE "admins" DROP COLUMN "is_email_verified";--> statement-breakpoint
ALTER TABLE "admins" ADD CONSTRAINT "admins_google_id_unique" UNIQUE("google_id");