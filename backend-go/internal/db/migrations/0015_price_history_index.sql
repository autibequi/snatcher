-- migrate:up
CREATE INDEX IF NOT EXISTS ix_price_history_variant_recorded
  ON pricehistoryv2(variant_id, recorded_at DESC);

-- migrate:down
-- noop
