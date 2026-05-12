CREATE TABLE IF NOT EXISTS extraction_logs (
    id                    BIGSERIAL PRIMARY KEY,
    source_id             TEXT   NOT NULL REFERENCES sources(id),
    field                 TEXT NOT NULL,
    scraper_config_id     BIGINT REFERENCES scraper_configs(id),
    extraction_successful BOOLEAN NOT NULL,
    error_message         TEXT,
    attempted_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_extraction_logs_time ON extraction_logs (source_id, attempted_at DESC);
