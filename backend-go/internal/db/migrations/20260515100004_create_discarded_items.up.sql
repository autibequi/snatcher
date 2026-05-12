CREATE TABLE IF NOT EXISTS discarded_items (
    id          BIGSERIAL PRIMARY KEY,
    raw_item_id BIGINT REFERENCES raw_items(id),
    source_id   BIGINT NOT NULL REFERENCES sources(id),
    reason      TEXT NOT NULL,
    payload     JSONB,
    discarded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_discarded_reason ON discarded_items (reason, discarded_at);
