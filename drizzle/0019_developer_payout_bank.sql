ALTER TABLE "developers" ADD COLUMN "payout_bank_country" varchar(100);--> statement-breakpoint
ALTER TABLE "developers" ADD COLUMN "payout_account_holder_name" text;--> statement-breakpoint
ALTER TABLE "developers" ADD COLUMN "payout_bank_name" text;--> statement-breakpoint
ALTER TABLE "developers" ADD COLUMN "payout_routing_code" varchar(34);--> statement-breakpoint
ALTER TABLE "developers" ADD COLUMN "payout_account_number" text;--> statement-breakpoint
ALTER TABLE "developers" ADD COLUMN "payout_account_type" varchar(24);--> statement-breakpoint
ALTER TABLE "developers" ADD COLUMN "payout_bank_details_updated_at" timestamp;