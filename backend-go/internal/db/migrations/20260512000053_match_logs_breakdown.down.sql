DROP INDEX IF EXISTS ix_aml_fp;
ALTER TABLE auto_match_logs
  DROP COLUMN IF EXISTS false_positive_marked_at,
  DROP COLUMN IF EXISTS false_positive_reason,
  DROP COLUMN IF EXISTS false_positive,
  DROP COLUMN IF EXISTS match_reasons,
  DROP COLUMN IF EXISTS score_breakdown;
