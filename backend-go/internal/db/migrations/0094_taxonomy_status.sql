-- migrate:up
ALTER TABLE taxonomy ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'approved';
ALTER TABLE taxonomy ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE taxonomy ADD COLUMN IF NOT EXISTS sample_text TEXT;
CREATE INDEX IF NOT EXISTS ix_taxonomy_status ON taxonomy(status) WHERE status = 'pending';

-- migrate:down
-- noop
