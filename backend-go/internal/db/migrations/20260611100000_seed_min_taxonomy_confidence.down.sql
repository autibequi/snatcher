DELETE FROM tunable_parameters
WHERE param_name = 'min_taxonomy_confidence'
  AND scope_type = 'global'
  AND scope_id IS NULL;

ALTER TABLE catalog_llm_queue DROP COLUMN IF EXISTS human_correction;
