CREATE TABLE IF NOT EXISTS taxonomy_rules (
    id           BIGSERIAL PRIMARY KEY,
    pattern      JSONB NOT NULL,
    category_id  BIGINT REFERENCES categories(id),
    brand        TEXT,
    product_type TEXT,
    source       TEXT NOT NULL,
    trust_score  NUMERIC(3,2) NOT NULL DEFAULT 0.30,
    applications INT NOT NULL DEFAULT 0,
    contradictions INT NOT NULL DEFAULT 0,
    enabled      BOOLEAN NOT NULL DEFAULT true,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_taxonomy_trust ON taxonomy_rules (trust_score DESC) WHERE enabled = true;
