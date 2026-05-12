CREATE TABLE IF NOT EXISTS channel_automations (
    id              BIGSERIAL PRIMARY KEY,
    channel_id      BIGINT NOT NULL REFERENCES channel(id) ON DELETE CASCADE,
    enabled         BOOLEAN NOT NULL DEFAULT FALSE,

    auto_match_enabled  BOOLEAN NOT NULL DEFAULT TRUE,
    threshold       FLOAT,
    max_per_run     INT,
    cooldown_hours  INT NOT NULL DEFAULT 6,

    events_enabled  BOOLEAN NOT NULL DEFAULT FALSE,
    notify_new      BOOLEAN NOT NULL DEFAULT FALSE,
    notify_drop     BOOLEAN NOT NULL DEFAULT FALSE,
    notify_lowest   BOOLEAN NOT NULL DEFAULT FALSE,
    drop_threshold  FLOAT NOT NULL DEFAULT 0.10,

    match_type      TEXT NOT NULL DEFAULT 'all',
    match_value     TEXT,
    max_price       FLOAT,

    paused_until    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(channel_id)
);

CREATE INDEX IF NOT EXISTS ix_channel_automations_enabled
    ON channel_automations(enabled) WHERE enabled = TRUE;

CREATE INDEX IF NOT EXISTS ix_auto_match_logs_channel
    ON auto_match_logs(channel_id, created_at DESC);
