-- migrate:up
-- Política opcional: auto-match só considera produtos já curados (curated/auto).
ALTER TABLE appconfig ADD COLUMN IF NOT EXISTS auto_match_only_curated BOOLEAN NOT NULL DEFAULT FALSE;

-- migrate:down
ALTER TABLE appconfig DROP COLUMN IF EXISTS auto_match_only_curated;
