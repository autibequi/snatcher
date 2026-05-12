CREATE TABLE IF NOT EXISTS ban_events (
    id              BIGSERIAL PRIMARY KEY,
    account_id      BIGINT NOT NULL REFERENCES accounts(id),
    modem_id        BIGINT NOT NULL REFERENCES modems(id),
    reason          TEXT,
    raw_response    JSONB,
    detected_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bans_modem_recent ON ban_events (modem_id, detected_at DESC);
