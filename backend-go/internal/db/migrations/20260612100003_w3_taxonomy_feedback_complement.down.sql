-- Reverter complement W3 taxonomy_feedback
DROP INDEX IF EXISTS idx_taxonomy_feedback_channel;

ALTER TABLE taxonomy_feedback
    DROP CONSTRAINT IF EXISTS chk_taxonomy_feedback_reassigned;

COMMENT ON COLUMN taxonomy_feedback.channel_id IS NULL;
