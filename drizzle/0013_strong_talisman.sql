-- Column may already exist from 0012 or manual/schema sync; safe to re-run.
ALTER TABLE "developer_products" ADD COLUMN IF NOT EXISTS "trust_yoursaas_certified" boolean DEFAULT false NOT NULL;