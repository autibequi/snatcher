-- 0083: add archived, last_error, last_error_at to groups
ALTER TABLE groups ADD COLUMN IF NOT EXISTS archived BOOLEAN DEFAULT false;
ALTER TABLE groups ADD COLUMN IF NOT EXISTS last_error TEXT;
ALTER TABLE groups ADD COLUMN IF NOT EXISTS last_error_at TIMESTAMPTZ;
