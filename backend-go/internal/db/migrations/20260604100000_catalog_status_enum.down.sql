DROP INDEX IF EXISTS idx_catalog_status_ready;
ALTER TABLE catalog DROP COLUMN catalog_status;
DROP TYPE catalog_status_t;
