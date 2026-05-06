CREATE TABLE IF NOT EXISTS channel_automations (
    id              BIGSERIAL PRIMARY KEY,
    channel_id      BIGINT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
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

-- Populate from channel_rules (1ª regra ativa por canal vence)
INSERT INTO channel_automations (
    channel_id, enabled, events_enabled,
    notify_new, notify_drop, notify_lowest, drop_threshold,
    match_type, match_value, max_price
)
SELECT DISTINCT ON (cr.channel_id)
    cr.channel_id,
    FALSE AS enabled,             -- opt-in manual após migração
    TRUE  AS events_enabled,      -- preserva intent original (eventos ativos)
    cr.notify_new, cr.notify_drop, cr.notify_lowest, cr.drop_threshold,
    cr.match_type, cr.match_value, cr.max_price
FROM channel_rules cr
WHERE cr.active = TRUE
ORDER BY cr.channel_id, cr.id ASC
ON CONFLICT (channel_id) DO NOTHING;
