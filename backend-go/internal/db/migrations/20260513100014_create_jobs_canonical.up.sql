-- Tabela jobs CANÔNICA. Coexiste com background_jobs durante transição (Q10 pendente).
CREATE TABLE IF NOT EXISTS jobs (
    id           BIGSERIAL PRIMARY KEY,
    type         TEXT NOT NULL,           -- 'crawl_page', 'triage_item', 'upsert_catalog', ...
    payload      JSONB NOT NULL,
    priority     INT NOT NULL DEFAULT 100,
    status       TEXT NOT NULL DEFAULT 'pending',
    attempts     INT NOT NULL DEFAULT 0,
    max_attempts INT NOT NULL DEFAULT 3,
    locked_by    TEXT,
    locked_at    TIMESTAMPTZ,
    run_after    TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_error   TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_jobs_ready
    ON jobs (type, priority, run_after)
    WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_jobs_locked
    ON jobs (locked_by, locked_at)
    WHERE status = 'running';
