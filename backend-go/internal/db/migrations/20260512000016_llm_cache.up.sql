CREATE TABLE IF NOT EXISTS llm_cache (
    cache_key    TEXT PRIMARY KEY,
    model        TEXT NOT NULL,
    response     TEXT NOT NULL,
    operation    TEXT NOT NULL DEFAULT '',
    tokens_in    INT NOT NULL DEFAULT 0,
    tokens_out   INT NOT NULL DEFAULT 0,
    cost_usd     NUMERIC(10,6) NOT NULL DEFAULT 0,
    expires_at   TIMESTAMPTZ NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_llm_cache_expires ON llm_cache(expires_at);
