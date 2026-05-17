CREATE TABLE channel_score_weights (
    channel_id    BIGINT PRIMARY KEY,
    weights       JSONB NOT NULL DEFAULT '{}'::jsonb,
    ucb1_state    JSONB NOT NULL DEFAULT '[]'::jsonb,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by    TEXT NOT NULL DEFAULT 'init'
);

CREATE TABLE channel_score_weights_history (
    id            BIGSERIAL PRIMARY KEY,
    channel_id    BIGINT NOT NULL,
    weights       JSONB NOT NULL,
    ucb1_state    JSONB NOT NULL,
    changed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    reason        TEXT
);

CREATE INDEX idx_channel_weights_history_channel ON channel_score_weights_history(channel_id, changed_at DESC);
