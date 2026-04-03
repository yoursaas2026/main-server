ALTER TABLE "developers" ADD COLUMN "plan" varchar(20) DEFAULT 'base';--> statement-breakpoint
ALTER TABLE "developers" ADD COLUMN "plan_billing_cycle" varchar(20) DEFAULT 'monthly';