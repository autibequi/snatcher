DROP FUNCTION IF EXISTS classify_category_from_brand(TEXT);
ALTER TABLE brand_keywords DROP COLUMN IF EXISTS default_category_slug;
