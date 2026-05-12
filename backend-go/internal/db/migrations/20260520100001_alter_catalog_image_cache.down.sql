DROP INDEX IF EXISTS idx_catalog_image_pending;
ALTER TABLE catalog DROP COLUMN IF EXISTS cached_image_at;
ALTER TABLE catalog DROP COLUMN IF EXISTS cached_image_path;
