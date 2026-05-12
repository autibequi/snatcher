CREATE TABLE IF NOT EXISTS price_history (
    catalog_id  BIGINT NOT NULL REFERENCES catalog(id) ON DELETE CASCADE,
    price       NUMERIC(12,2) NOT NULL,
    seen_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (catalog_id, seen_at)
);
