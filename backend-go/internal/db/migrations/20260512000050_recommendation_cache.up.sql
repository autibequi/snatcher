CREATE TABLE IF NOT EXISTS recommendation_cache (
    id              INT PRIMARY KEY DEFAULT 1,
    headline        TEXT NOT NULL DEFAULT '',
    reason          TEXT NOT NULL DEFAULT '',
    actions         JSONB NOT NULL DEFAULT '[]',
    generated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    cached_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO recommendation_cache (id) VALUES (1) ON CONFLICT DO NOTHING;
