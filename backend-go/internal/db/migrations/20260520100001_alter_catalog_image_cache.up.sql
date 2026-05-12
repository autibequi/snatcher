ALTER TABLE catalog ADD COLUMN IF NOT EXISTS cached_image_path TEXT;
ALTER TABLE catalog ADD COLUMN IF NOT EXISTS cached_image_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_catalog_image_pending ON catalog (id)
    WHERE image_url IS NOT NULL AND cached_image_path IS NULL;
