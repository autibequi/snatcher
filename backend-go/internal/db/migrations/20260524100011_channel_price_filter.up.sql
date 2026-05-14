-- Filtros duros de faixa de preço e desconto mínimo por canal.
-- Permitem expressar "este canal é de produtos de R$15–R$80 com ≥10% de desconto"
-- ortogonalmente aos pesos de categoria (que são sinais suaves no score).
--
-- NULL = sem limite (sem filtro). min_discount_pct = 0 (default) = sem filtro.
ALTER TABLE channels_v2
    ADD COLUMN IF NOT EXISTS price_min        NUMERIC(12,2),           -- NULL = sem mínimo
    ADD COLUMN IF NOT EXISTS price_max        NUMERIC(12,2),           -- NULL = sem máximo
    ADD COLUMN IF NOT EXISTS min_discount_pct NUMERIC(5,2) NOT NULL DEFAULT 0; -- 0 = sem filtro
