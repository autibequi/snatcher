-- Cria tabela group_sent_history com PK composta para dedup de envios por grupo
CREATE TABLE IF NOT EXISTS group_sent_history (
    group_id  BIGINT NOT NULL,
    dedup_key TEXT NOT NULL,
    sent_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (group_id, dedup_key, sent_at)
);

CREATE INDEX IF NOT EXISTS idx_sent_history_recent
    ON group_sent_history (group_id, dedup_key, sent_at DESC);
