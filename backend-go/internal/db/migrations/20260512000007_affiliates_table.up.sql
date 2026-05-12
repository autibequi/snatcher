CREATE TABLE IF NOT EXISTS affiliates (
    id BIGSERIAL PRIMARY KEY,
    source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE RESTRICT,
    name TEXT NOT NULL,
    tracking_id TEXT NOT NULL,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_affiliates_source ON affiliates(source_id, active);

-- Backfill from AppConfig (colunas podem não existir se 0008 já rodou antes)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'appconfig' AND column_name = 'ml_affiliate_tool_id'
    ) THEN
        INSERT INTO affiliates (source_id, name, tracking_id, active)
        SELECT 'ml', 'default', ml_affiliate_tool_id, true FROM appconfig
        WHERE ml_affiliate_tool_id IS NOT NULL AND ml_affiliate_tool_id != '';
    END IF;
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'appconfig' AND column_name = 'amz_tracking_id'
    ) THEN
        INSERT INTO affiliates (source_id, name, tracking_id, active)
        SELECT 'amz', 'default', amz_tracking_id, true FROM appconfig
        WHERE amz_tracking_id IS NOT NULL AND amz_tracking_id != '';
    END IF;
END $$;
