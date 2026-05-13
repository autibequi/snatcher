ALTER TABLE bandit_arms
    ADD COLUMN IF NOT EXISTS processed_up_to TIMESTAMPTZ NOT NULL DEFAULT '1970-01-01'::timestamptz;

UPDATE bandit_arms SET processed_up_to = LEAST(cursor_conversions, cursor_clicks, cursor_losses);

ALTER TABLE bandit_arms
    DROP COLUMN IF EXISTS cursor_conversions,
    DROP COLUMN IF EXISTS cursor_clicks,
    DROP COLUMN IF EXISTS cursor_losses;
