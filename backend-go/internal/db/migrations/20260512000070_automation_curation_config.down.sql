ALTER TABLE appconfig DROP COLUMN IF EXISTS curation_heuristic_last_run_at;
ALTER TABLE appconfig DROP COLUMN IF EXISTS curation_heuristic_last_id;
ALTER TABLE appconfig DROP COLUMN IF EXISTS curation_heuristic_batch_size;
ALTER TABLE appconfig DROP COLUMN IF EXISTS curation_heuristic_interval_seconds;
ALTER TABLE appconfig DROP COLUMN IF EXISTS curation_llm_confidence_threshold;
ALTER TABLE appconfig DROP COLUMN IF EXISTS curation_script_confidence_min;
ALTER TABLE appconfig DROP COLUMN IF EXISTS auto_match_product_cursor;
ALTER TABLE appconfig DROP COLUMN IF EXISTS auto_match_interval_seconds;
