ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "settlement_status" varchar(24);
ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "settlement_meta_json" text;

ALTER TABLE "contract_payments" ADD COLUMN IF NOT EXISTS "refund_id" varchar(100);
ALTER TABLE "contract_payments" ADD COLUMN IF NOT EXISTS "refund_amount_paise" integer DEFAULT 0;
