CREATE TYPE automation_kind_t AS ENUM ('critical','elective');

CREATE TABLE IF NOT EXISTS automations (
    id                       TEXT PRIMARY KEY,
    kind                     automation_kind_t NOT NULL,
    enabled                  BOOLEAN NOT NULL DEFAULT TRUE,
    cron_expr                TEXT,
    interval_minutes         INT,
    controlled_by_jonfrey    BOOLEAN NOT NULL DEFAULT TRUE,
    params                   JSONB NOT NULL DEFAULT '{}'::jsonb,
    last_run_at              TIMESTAMPTZ,
    last_status              TEXT,
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed 8 automations (7 actions backend de jonfrey.go:118+ + tune_bandit_exploration)
INSERT INTO automations (id, kind, controlled_by_jonfrey, interval_minutes) VALUES
    ('inspect_pending_products',    'critical', FALSE, 60),
    ('detect_failing_channel',      'critical', FALSE, 30),
    ('tune_thresholds',             'elective', TRUE, 240),
    ('auto_curate_high_confidence', 'elective', TRUE, 120),
    ('manage_group_health',         'elective', TRUE, 180),
    ('audit_affiliate_coverage',    'elective', TRUE, 1440),
    ('replenish_stagnant_crawlers', 'elective', TRUE, 720),
    ('tune_bandit_exploration',     'elective', TRUE, 360)
ON CONFLICT (id) DO NOTHING;

CREATE TYPE jonfrey_decision_t AS ENUM ('pause','resume','tune','freeze_channel','escalate_to_human');

CREATE TABLE IF NOT EXISTS jonfrey_decisions (
    id              BIGSERIAL PRIMARY KEY,
    automation_id   TEXT REFERENCES automations(id) ON DELETE SET NULL,
    decision        jonfrey_decision_t NOT NULL,
    reason          TEXT NOT NULL,
    payload         JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_jonfrey_decisions_automation ON jonfrey_decisions(automation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jonfrey_decisions_recent ON jonfrey_decisions(created_at DESC);
