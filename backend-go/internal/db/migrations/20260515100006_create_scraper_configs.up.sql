CREATE TABLE IF NOT EXISTS scraper_configs (
    id           BIGSERIAL PRIMARY KEY,
    source_id    BIGINT NOT NULL REFERENCES sources(id),
    field        TEXT NOT NULL,
    selector     TEXT NOT NULL,
    extractor    TEXT,
    version      INT NOT NULL DEFAULT 1,
    status       TEXT NOT NULL DEFAULT 'active',
    shadow_weight INT,
    success_rate NUMERIC(5,4),
    attempts     INT NOT NULL DEFAULT 0,
    created_by   TEXT NOT NULL DEFAULT 'manual',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    promoted_at  TIMESTAMPTZ,
    archived_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_scraper_active ON scraper_configs (source_id, field) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_scraper_shadow ON scraper_configs (source_id, field) WHERE status = 'shadow';

-- Seeds: 4 fields per source (title, price_current, image_url, canonical_url)
INSERT INTO scraper_configs (source_id, field, selector, status, created_by)
SELECT s.id, f.field, 'TBD', 'active', 'manual'
FROM sources s
CROSS JOIN (VALUES ('title'), ('price_current'), ('image_url'), ('canonical_url')) AS f(field)
WHERE s.slug IN ('amazon','mercadolivre','shopee','awin','shein','magalu','aliexpress','humble','kinguin')
ON CONFLICT DO NOTHING;
