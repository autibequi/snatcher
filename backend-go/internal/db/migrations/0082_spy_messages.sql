CREATE TABLE IF NOT EXISTS spy_messages (
    id          BIGSERIAL PRIMARY KEY,
    spy_id      BIGINT NOT NULL REFERENCES group_spies(id) ON DELETE CASCADE,
    sender      TEXT NOT NULL DEFAULT '',
    text        TEXT NOT NULL DEFAULT '',
    media_url   TEXT,
    raw         JSONB,
    collected_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_spy_messages_spy_id ON spy_messages(spy_id, collected_at DESC);
