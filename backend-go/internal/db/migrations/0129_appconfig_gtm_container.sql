-- migrate:up
ALTER TABLE appconfig ADD COLUMN IF NOT EXISTS gtm_container_id TEXT;

-- migrate:down
ALTER TABLE appconfig DROP COLUMN IF EXISTS gtm_container_id;
