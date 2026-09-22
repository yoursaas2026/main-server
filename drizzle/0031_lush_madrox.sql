ALTER TABLE "client_listing_events" DROP CONSTRAINT "client_listing_events_product_id_developer_products_id_fk";
--> statement-breakpoint
ALTER TABLE "product_releases" DROP CONSTRAINT "product_releases_product_id_developer_products_id_fk";
--> statement-breakpoint
ALTER TABLE "product_reviews" DROP CONSTRAINT "product_reviews_product_id_developer_products_id_fk";
--> statement-breakpoint
ALTER TABLE "client_listing_events" ADD CONSTRAINT "client_listing_events_product_id_developer_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."developer_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_releases" ADD CONSTRAINT "product_releases_product_id_developer_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."developer_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_reviews" ADD CONSTRAINT "product_reviews_product_id_developer_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."developer_products"("id") ON DELETE cascade ON UPDATE no action;