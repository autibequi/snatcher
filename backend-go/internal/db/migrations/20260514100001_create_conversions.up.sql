-- Tabela canônica de conversões reais (P0 do brief)
CREATE TABLE IF NOT EXISTS conversions (
    id              BIGSERIAL PRIMARY KEY,
    short_id        TEXT NOT NULL,
    catalog_id      BIGINT,  -- FK adicionada quando catalog existir (Fase 3)
    group_id        BIGINT REFERENCES groups(id),
    source_id       TEXT   NOT NULL REFERENCES sources(id),
    external_tx_id  TEXT,
    order_value     NUMERIC(12,2),
    commission      NUMERIC(12,4),
    currency        TEXT NOT NULL DEFAULT 'BRL',
    status          TEXT NOT NULL DEFAULT 'pending',
    occurred_at     TIMESTAMPTZ NOT NULL,
    confirmed_at    TIMESTAMPTZ,
    raw_webhook     JSONB,
    UNIQUE (external_tx_id, source_id)
);
CREATE INDEX IF NOT EXISTS idx_conversions_short ON conversions (short_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversions_catalog ON conversions (catalog_id, occurred_at DESC);
