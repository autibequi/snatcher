-- 0086: create affiliate_conversions table
CREATE TABLE IF NOT EXISTS affiliate_conversions (
    id                BIGSERIAL PRIMARY KEY,
    program_id        BIGINT NOT NULL REFERENCES affiliate_programs(id),
    click_id          BIGINT,
    external_order_id TEXT,
    revenue           NUMERIC(12,2),
    status            TEXT DEFAULT 'pending',
    created_at        TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_aff_conv_program ON affiliate_conversions(program_id);
