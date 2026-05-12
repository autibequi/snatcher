CREATE TABLE IF NOT EXISTS parameter_ab_tests (
    id                  BIGSERIAL PRIMARY KEY,
    param_id            BIGINT NOT NULL REFERENCES tunable_parameters(id),
    proposed_value      NUMERIC NOT NULL,
    weight_pct          INT NOT NULL DEFAULT 30,
    metric_name         TEXT NOT NULL,
    metric_baseline     NUMERIC,
    metric_test         NUMERIC,
    samples_baseline    INT NOT NULL DEFAULT 0,
    samples_test        INT NOT NULL DEFAULT 0,
    status              TEXT NOT NULL DEFAULT 'running',
    started_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    ends_at             TIMESTAMPTZ NOT NULL,
    decided_at          TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_ab_running ON parameter_ab_tests (status) WHERE status = 'running';
