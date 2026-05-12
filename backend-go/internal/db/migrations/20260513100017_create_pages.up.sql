-- Cria tabela pages para URLs de crawl por fonte com unicidade (source_id, url)
CREATE TABLE IF NOT EXISTS pages (
    id             BIGSERIAL PRIMARY KEY,
    source_id      TEXT   NOT NULL REFERENCES sources(id),
    url            TEXT NOT NULL,                -- URL/endpoint a crawlar
    cron           TEXT NOT NULL,                -- '*/10 * * * *'
    last_crawled_at TIMESTAMPTZ,
    enabled        BOOLEAN NOT NULL DEFAULT true,
    UNIQUE (source_id, url)
);
