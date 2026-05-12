CREATE TABLE IF NOT EXISTS catalog (
    id              BIGSERIAL PRIMARY KEY,
    dedup_key       TEXT UNIQUE NOT NULL,
    short_id        TEXT UNIQUE NOT NULL,
    source_id       TEXT   NOT NULL REFERENCES sources(id),
    category_id     BIGINT REFERENCES categories(id),

    title           TEXT NOT NULL,
    description     TEXT,
    image_url       TEXT,

    price_original  NUMERIC(12,2),
    price_current   NUMERIC(12,2) NOT NULL,
    discount_pct    NUMERIC(5,2) GENERATED ALWAYS AS (
        CASE WHEN price_original IS NULL OR price_original = 0 THEN 0
             ELSE ((price_original - price_current) / price_original * 100) END
    ) STORED,

    canonical_url   TEXT NOT NULL,
    content_hash    TEXT NOT NULL,

    send_ready      BOOLEAN NOT NULL DEFAULT false,
    send_ready_at   TIMESTAMPTZ,

    quality_score       NUMERIC(5,4),
    quality_score_at    TIMESTAMPTZ,
    price_anchor_30d    NUMERIC(12,2),
    anchor_confidence   NUMERIC(3,2),
    last_price_drop_at  TIMESTAMPTZ,
    canonical_url_alive BOOLEAN NOT NULL DEFAULT true,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_catalog_ready ON catalog (send_ready_at DESC) WHERE send_ready = true;
CREATE INDEX IF NOT EXISTS idx_catalog_category ON catalog (category_id);
CREATE INDEX IF NOT EXISTS idx_catalog_quality ON catalog (category_id, quality_score DESC)
    WHERE send_ready = true AND canonical_url_alive = true;
