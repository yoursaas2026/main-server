ALTER TABLE "developer_products" ADD COLUMN IF NOT EXISTS "project_id" varchar(120);--> statement-breakpoint
UPDATE "developer_products" SET "project_id" = 'legacy-project' WHERE "project_id" IS NULL;--> statement-breakpoint
ALTER TABLE "developer_products" ALTER COLUMN "project_id" SET NOT NULL;