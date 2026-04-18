ALTER TABLE "developers" ADD COLUMN "payout_razorpay_contact_id" varchar(64);--> statement-breakpoint
ALTER TABLE "developers" ADD COLUMN "payout_razorpay_fund_account_id" varchar(64);--> statement-breakpoint
ALTER TABLE "developers" ADD COLUMN "payout_bank_validation_id" varchar(64);--> statement-breakpoint
ALTER TABLE "developers" ADD COLUMN "payout_bank_validation_status" varchar(24);--> statement-breakpoint
ALTER TABLE "developers" ADD COLUMN "payout_bank_validation_account_status" varchar(32);--> statement-breakpoint
ALTER TABLE "developers" ADD COLUMN "payout_bank_validation_details" text;--> statement-breakpoint
ALTER TABLE "developers" ADD COLUMN "payout_bank_validation_at" timestamp;