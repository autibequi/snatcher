CREATE TABLE outbox_events (
    id             BIGSERIAL PRIMARY KEY,
    aggregate_id   TEXT NOT NULL,
    event_type     TEXT NOT NULL,
    payload        JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    processed_at   TIMESTAMPTZ,
    attempts       INT NOT NULL DEFAULT 0,
    last_error     TEXT
);

-- Index parcial para o reader que processa eventos pendentes
CREATE INDEX idx_outbox_pending ON outbox_events(created_at)
    WHERE processed_at IS NULL;

-- Index para query histórica por aggregate
CREATE INDEX idx_outbox_aggregate ON outbox_events(aggregate_id, created_at DESC);
