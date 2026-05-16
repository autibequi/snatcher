CREATE TABLE dispatch_rejections (
    id                 BIGSERIAL PRIMARY KEY,
    catalog_id         BIGINT REFERENCES catalog(id) ON DELETE CASCADE,
    channel_id         BIGINT,
    reason             TEXT NOT NULL,
    rejected_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    payload            JSONB
);

CREATE INDEX idx_dispatch_rejections_reason ON dispatch_rejections(reason, rejected_at DESC);
CREATE INDEX idx_dispatch_rejections_catalog ON dispatch_rejections(catalog_id, rejected_at DESC);
