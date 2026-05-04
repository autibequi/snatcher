-- migrate:up
CREATE TABLE IF NOT EXISTS affiliates (
    id BIGSERIAL PRIMARY KEY,
    source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE RESTRICT,
    name TEXT NOT NULL,
    tracking_id TEXT NOT NULL,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_affiliates_source ON affiliates(source_id, active);

-- Backfill from AppConfig
INSERT INTO affiliates (source_id, name, tracking_id, active)
SELECT 'ml', 'default', ml_affiliate_tool_id, true FROM appconfig
WHERE ml_affiliate_tool_id IS NOT NULL AND ml_affiliate_tool_id != '';

INSERT INTO affiliates (source_id, name, tracking_id, active)
SELECT 'amz', 'default', amz_tracking_id, true FROM appconfig
WHERE amz_tracking_id IS NOT NULL AND amz_tracking_id != '';

-- migrate:down
-- noop
