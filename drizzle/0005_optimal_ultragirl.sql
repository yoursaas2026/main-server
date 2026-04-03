ALTER TABLE "admins" RENAME COLUMN "google_id" TO "password";--> statement-breakpoint
ALTER TABLE "admins" DROP CONSTRAINT "admins_google_id_unique";