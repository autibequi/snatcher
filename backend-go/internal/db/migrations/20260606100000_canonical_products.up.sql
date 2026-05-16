CREATE TABLE canonical_products (
    id                 BIGSERIAL PRIMARY KEY,
    fingerprint        BYTEA NOT NULL,
    title_canonical    TEXT NOT NULL,
    brand_id           BIGINT,
    price_band         INT,
    low_confidence     BOOLEAN NOT NULL DEFAULT FALSE,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- UNIQUE index parcial: só colapsa produtos com brand confirmada (low_confidence = false).
-- Items sem brand_id ficam com low_confidence=true e não entram no index — evita
-- colapso incorreto de títulos similares de marcas diferentes.
CREATE UNIQUE INDEX idx_canonical_fingerprint
    ON canonical_products(fingerprint)
    WHERE low_confidence = FALSE;

-- FK em catalog para o canonical correspondente (NULL enquanto não processado).
ALTER TABLE catalog ADD COLUMN canonical_product_id BIGINT REFERENCES canonical_products(id);

-- Index parcial para buscas por canonical_product_id (dispatches e cooldown checks).
CREATE INDEX idx_catalog_canonical ON catalog(canonical_product_id) WHERE canonical_product_id IS NOT NULL;
