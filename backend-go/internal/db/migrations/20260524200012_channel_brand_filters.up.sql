CREATE TABLE IF NOT EXISTS channel_brand_filters (
    id            BIGSERIAL PRIMARY KEY,
    channel_id    BIGINT NOT NULL REFERENCES channels_v2(id) ON DELETE CASCADE,
    brand_slug    TEXT NOT NULL,
    brand_display TEXT NOT NULL,
    mode          TEXT NOT NULL DEFAULT 'include' CHECK (mode IN ('include', 'exclude')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (channel_id, brand_slug, mode)
);
CREATE INDEX IF NOT EXISTS idx_channel_brand_filters_channel ON channel_brand_filters(channel_id);
