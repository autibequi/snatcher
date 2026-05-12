ALTER TABLE appconfig ADD COLUMN IF NOT EXISTS auto_match_interval_seconds INT NOT NULL DEFAULT 60;
ALTER TABLE appconfig ADD COLUMN IF NOT EXISTS auto_match_product_cursor BIGINT NOT NULL DEFAULT 0;
ALTER TABLE appconfig ADD COLUMN IF NOT EXISTS curation_script_confidence_min DOUBLE PRECISION NOT NULL DEFAULT 0.75;
ALTER TABLE appconfig ADD COLUMN IF NOT EXISTS curation_llm_confidence_threshold DOUBLE PRECISION NOT NULL DEFAULT 0.65;
ALTER TABLE appconfig ADD COLUMN IF NOT EXISTS curation_heuristic_interval_seconds INT NOT NULL DEFAULT 120;
ALTER TABLE appconfig ADD COLUMN IF NOT EXISTS curation_heuristic_batch_size INT NOT NULL DEFAULT 500;
ALTER TABLE appconfig ADD COLUMN IF NOT EXISTS curation_heuristic_last_id BIGINT NOT NULL DEFAULT 0;
ALTER TABLE appconfig ADD COLUMN IF NOT EXISTS curation_heuristic_last_run_at TIMESTAMPTZ;
