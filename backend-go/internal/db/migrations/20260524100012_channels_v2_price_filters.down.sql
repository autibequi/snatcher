ALTER TABLE channels_v2
    DROP COLUMN IF EXISTS price_min,
    DROP COLUMN IF EXISTS price_max,
    DROP COLUMN IF EXISTS min_discount_pct;
