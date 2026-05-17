-- Rollback do complemento 20260607100002_quarantine_events_add_triggered_by
-- Remove índices adicionados e reverte triggered_by.
-- Restaura o índice original (composto com quarantine_until) como estava em 20260607100001.

DROP INDEX IF EXISTS idx_quarantine_events_triggered;
DROP INDEX IF EXISTS idx_quarantine_events_active;
DROP INDEX IF EXISTS idx_quarantine_events_subject;

-- Restaura índice original da migration 20260607100001
CREATE INDEX idx_quarantine_events_active
    ON quarantine_events(subject_kind, subject_id, quarantine_until)
    WHERE lifted_at IS NULL;

ALTER TABLE quarantine_events
    DROP COLUMN IF EXISTS triggered_by;

COMMENT ON COLUMN redirect_domains.quarantine_until IS NULL;
