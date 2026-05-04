-- migrate:up
ALTER TABLE catalogvariant ADD COLUMN IF NOT EXISTS short_id TEXT;
CREATE INDEX IF NOT EXISTS idx_catalogvariant_shortid ON catalogvariant(short_id);

-- migrate:down
-- noop
