-- Add source_counts JSON column to crawl_log
-- This replaces hard-coded ml_count and amz_count with a generic map
-- Legacy columns are kept for 30 days to maintain backward compatibility

ALTER TABLE crawllog ADD COLUMN IF NOT EXISTS source_counts TEXT;

-- Backfill existing rows with source_counts JSON from the legacy columns
-- Format: {"ml": <ml_count>, "amz": <amz_count>}
UPDATE crawllog SET source_counts = '{"ml":' || ml_count || ',"amz":' || amz_count || '}';
