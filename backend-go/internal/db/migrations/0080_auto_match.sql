-- Auto match: flag no appconfig + tabela de log
ALTER TABLE appconfig ADD COLUMN IF NOT EXISTS auto_match_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE appconfig ADD COLUMN IF NOT EXISTS auto_match_threshold FLOAT NOT NULL DEFAULT 50;
ALTER TABLE appconfig ADD COLUMN IF NOT EXISTS auto_match_max_per_run INT NOT NULL DEFAULT 3;

CREATE TABLE IF NOT EXISTS auto_match_logs (
    id           BIGSERIAL PRIMARY KEY,
    product_id   BIGINT REFERENCES catalogproduct(id),
    channel_id   BIGINT REFERENCES channel(id),
    dispatch_id  BIGINT REFERENCES dispatches(id),
    score        FLOAT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_auto_match_logs_created ON auto_match_logs(created_at DESC);
