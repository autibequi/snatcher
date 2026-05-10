-- migrate:up
ALTER TABLE appconfig ADD COLUMN IF NOT EXISTS auto_match_interval_seconds INT NOT NULL DEFAULT 60;
ALTER TABLE appconfig ADD COLUMN IF NOT EXISTS auto_match_product_cursor BIGINT NOT NULL DEFAULT 0;
ALTER TABLE appconfig ADD COLUMN IF NOT EXISTS curation_script_confidence_min DOUBLE PRECISION NOT NULL DEFAULT 0.75;
ALTER TABLE appconfig ADD COLUMN IF NOT EXISTS curation_llm_confidence_threshold DOUBLE PRECISION NOT NULL DEFAULT 0.65;
ALTER TABLE appconfig ADD COLUMN IF NOT EXISTS curation_heuristic_interval_seconds INT NOT NULL DEFAULT 120;
ALTER TABLE appconfig ADD COLUMN IF NOT EXISTS curation_heuristic_batch_size INT NOT NULL DEFAULT 500;
ALTER TABLE appconfig ADD COLUMN IF NOT EXISTS curation_heuristic_last_id BIGINT NOT NULL DEFAULT 0;
ALTER TABLE appconfig ADD COLUMN IF NOT EXISTS curation_heuristic_last_run_at TIMESTAMPTZ;

-- migrate:down
ALTER TABLE appconfig DROP COLUMN IF EXISTS curation_heuristic_last_run_at;
ALTER TABLE appconfig DROP COLUMN IF EXISTS curation_heuristic_last_id;
ALTER TABLE appconfig DROP COLUMN IF EXISTS curation_heuristic_batch_size;
ALTER TABLE appconfig DROP COLUMN IF EXISTS curation_heuristic_interval_seconds;
ALTER TABLE appconfig DROP COLUMN IF EXISTS curation_llm_confidence_threshold;
ALTER TABLE appconfig DROP COLUMN IF EXISTS curation_script_confidence_min;
ALTER TABLE appconfig DROP COLUMN IF EXISTS auto_match_product_cursor;
ALTER TABLE appconfig DROP COLUMN IF EXISTS auto_match_interval_seconds;
