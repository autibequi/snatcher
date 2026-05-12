CREATE TABLE IF NOT EXISTS send_log (
    id              BIGSERIAL PRIMARY KEY,
    send_queue_id   BIGINT,
    group_id        BIGINT NOT NULL REFERENCES groups(id),
    account_id      BIGINT NOT NULL REFERENCES accounts(id),
    catalog_id      BIGINT NOT NULL REFERENCES catalog(id),
    domain_id       BIGINT REFERENCES redirect_domains(id),
    template_id     BIGINT REFERENCES templates(id),
    status          TEXT NOT NULL,
    error_code      TEXT,
    sent_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sendlog_account ON send_log (account_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_sendlog_domain ON send_log (domain_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_sendlog_group ON send_log (group_id, sent_at DESC);
