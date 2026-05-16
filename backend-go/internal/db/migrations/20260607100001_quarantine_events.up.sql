CREATE TABLE quarantine_events (
    id                  BIGSERIAL PRIMARY KEY,
    subject_kind        TEXT NOT NULL CHECK (subject_kind IN ('redirect_domain','account','channel','catalog_item')),
    subject_id          BIGINT NOT NULL,
    reason              TEXT NOT NULL,
    triggered_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    quarantine_until    TIMESTAMPTZ,
    lifted_at           TIMESTAMPTZ,
    lifted_by           TEXT,
    payload             JSONB
);

CREATE INDEX idx_quarantine_events_active ON quarantine_events(subject_kind, subject_id, quarantine_until)
    WHERE lifted_at IS NULL;

CREATE INDEX idx_quarantine_events_recent ON quarantine_events(triggered_at DESC);
