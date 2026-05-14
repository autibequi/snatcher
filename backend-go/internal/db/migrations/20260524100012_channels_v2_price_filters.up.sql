-- Filtros de preço e desconto por canal — usados pelo Score Engine para
-- excluir produtos fora da faixa de interesse do canal.
ALTER TABLE channels_v2
    ADD COLUMN IF NOT EXISTS price_min NUMERIC(12,2),
    ADD COLUMN IF NOT EXISTS price_max NUMERIC(12,2),
    ADD COLUMN IF NOT EXISTS min_discount_pct NUMERIC(5,2) NOT NULL DEFAULT 0;
