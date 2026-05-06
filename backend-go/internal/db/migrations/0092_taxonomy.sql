-- migrate:up
CREATE TABLE IF NOT EXISTS taxonomy (
    id          BIGSERIAL PRIMARY KEY,
    type        TEXT NOT NULL CHECK (type IN ('category', 'brand')),
    name        TEXT NOT NULL,
    slug        TEXT NOT NULL,
    keywords    TEXT[] NOT NULL DEFAULT '{}',
    parent_id   BIGINT REFERENCES taxonomy(id) ON DELETE SET NULL,
    detect_count INT NOT NULL DEFAULT 0,
    last_detected_at TIMESTAMPTZ,
    active      BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(type, slug)
);
CREATE INDEX IF NOT EXISTS ix_taxonomy_type_active ON taxonomy(type, active);
CREATE INDEX IF NOT EXISTS ix_taxonomy_keywords ON taxonomy USING gin(keywords);

-- migrate:down
-- noop
