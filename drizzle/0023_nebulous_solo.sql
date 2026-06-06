ALTER TABLE "admins" ADD COLUMN "reset_password_token" text;--> statement-breakpoint
ALTER TABLE "admins" ADD COLUMN "reset_password_expiry" timestamp;