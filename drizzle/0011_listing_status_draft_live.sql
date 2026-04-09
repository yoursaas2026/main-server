-- Normalize legacy "review" to "draft" (only draft | live are supported going forward)
UPDATE developer_products SET listing_status = 'draft' WHERE listing_status = 'review';
