CREATE TABLE IF NOT EXISTS raw_items (
    id          BIGSERIAL PRIMARY KEY,
    source_id   BIGINT NOT NULL REFERENCES sources(id),
    page_id     BIGINT REFERENCES pages(id),
    payload     JSONB NOT NULL,
    crawled_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    processed   BOOLEAN NOT NULL DEFAULT false,
    processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_raw_unprocessed ON raw_items (crawled_at) WHERE processed = false;
