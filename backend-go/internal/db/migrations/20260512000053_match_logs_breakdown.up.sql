-- Add breakdown and false positive tracking to auto_match_logs
ALTER TABLE auto_match_logs
  ADD COLUMN IF NOT EXISTS score_breakdown JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS match_reasons TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS false_positive BOOLEAN,
  ADD COLUMN IF NOT EXISTS false_positive_reason TEXT,
  ADD COLUMN IF NOT EXISTS false_positive_marked_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS ix_aml_fp ON auto_match_logs(false_positive) WHERE false_positive = true;
