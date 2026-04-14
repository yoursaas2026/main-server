CREATE TABLE IF NOT EXISTS "product_categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(80) NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "product_categories_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "developer_products" ADD COLUMN IF NOT EXISTS "product_category_id" integer;
--> statement-breakpoint
UPDATE "developer_products" dp
SET "product_category_id" = pc."id"
FROM "product_categories" pc
WHERE dp."product_category_id" IS NULL
  AND dp."product_category" IS NOT NULL
  AND lower(trim(dp."product_category")) = lower(trim(pc."name"));
--> statement-breakpoint
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'developer_products_product_category_id_product_categories_id_fk'
    ) THEN
        ALTER TABLE "developer_products"
        ADD CONSTRAINT "developer_products_product_category_id_product_categories_id_fk"
        FOREIGN KEY ("product_category_id")
        REFERENCES "product_categories"("id")
        ON DELETE SET NULL
        ON UPDATE NO ACTION;
    END IF;
END $$;
CREATE TABLE IF NOT EXISTS "product_categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(80) NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "product_categories_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "developer_products" ADD COLUMN IF NOT EXISTS "product_category_id" integer;
--> statement-breakpoint
UPDATE "developer_products" dp
SET "product_category_id" = pc."id"
FROM "product_categories" pc
WHERE dp."product_category_id" IS NULL
  AND dp."product_category" IS NOT NULL
  AND lower(trim(dp."product_category")) = lower(trim(pc."name"));
--> statement-breakpoint
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'developer_products_product_category_id_product_categories_id_fk'
    ) THEN
        ALTER TABLE "developer_products"
        ADD CONSTRAINT "developer_products_product_category_id_product_categories_id_fk"
        FOREIGN KEY ("product_category_id")
        REFERENCES "product_categories"("id")
        ON DELETE SET NULL
        ON UPDATE NO ACTION;
    END IF;
END $$;