ALTER TABLE "contract_payments" ADD COLUMN "refund_id" varchar(100);--> statement-breakpoint
ALTER TABLE "contract_payments" ADD COLUMN "refund_amount_paise" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN "settlement_status" varchar(24);--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN "settlement_meta_json" text;