CREATE TABLE IF NOT EXISTS send_queue (
    id              BIGSERIAL PRIMARY KEY,
    modem_id        BIGINT NOT NULL REFERENCES modems(id),
    group_id        BIGINT NOT NULL REFERENCES groups(id),
    catalog_id      BIGINT NOT NULL REFERENCES catalog(id),
    account_id      BIGINT REFERENCES accounts(id),
    template_id     BIGINT REFERENCES templates(id),
    domain_id       BIGINT REFERENCES redirect_domains(id),
    score           NUMERIC(5,3),
    enqueued_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    attempts        INT NOT NULL DEFAULT 0,
    status          TEXT NOT NULL DEFAULT 'pending'
);
CREATE INDEX IF NOT EXISTS idx_queue_pending ON send_queue (modem_id, enqueued_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_queue_sending ON send_queue (status, enqueued_at) WHERE status = 'sending';
