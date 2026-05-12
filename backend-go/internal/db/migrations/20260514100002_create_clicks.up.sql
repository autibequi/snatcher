-- Tabela canônica de clicks (unifica clicklog + shortlink_clicks)
CREATE TABLE IF NOT EXISTS clicks (
    id              BIGSERIAL PRIMARY KEY,
    short_id        TEXT NOT NULL,
    catalog_id      BIGINT,  -- nullable durante transição
    domain_host     TEXT NOT NULL,
    group_id        BIGINT REFERENCES groups(id),
    user_agent      TEXT,
    ip              INET,
    clicked_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_clicks_short ON clicks (short_id, clicked_at DESC);
CREATE INDEX IF NOT EXISTS idx_clicks_clicked ON clicks (clicked_at DESC);
