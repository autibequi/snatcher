DROP INDEX IF EXISTS idx_catalog_canonical;
ALTER TABLE catalog DROP COLUMN canonical_product_id;
DROP INDEX IF EXISTS idx_canonical_fingerprint;
DROP TABLE canonical_products;
