CREATE TABLE baseline_snapshots (
    id             BIGSERIAL PRIMARY KEY,
    captured_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    scope          TEXT NOT NULL DEFAULT 'global',
    metric_name    TEXT NOT NULL,
    value_numeric  NUMERIC(18,6),
    value_json     JSONB,
    CONSTRAINT chk_value CHECK (value_numeric IS NOT NULL OR value_json IS NOT NULL)
);

CREATE INDEX idx_baseline_snapshots_captured_at ON baseline_snapshots(captured_at DESC);
CREATE INDEX idx_baseline_snapshots_metric ON baseline_snapshots(metric_name, captured_at DESC);
