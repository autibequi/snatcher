-- migrate:up
ALTER TABLE searchterm ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'ecommerce' CHECK (category IN ('ecommerce','cdkey'));

-- migrate:down
-- noop
