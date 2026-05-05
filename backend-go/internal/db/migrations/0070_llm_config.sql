-- migrate:up
ALTER TABLE appconfig ADD COLUMN IF NOT EXISTS llm_provider TEXT NOT NULL DEFAULT 'openrouter';
ALTER TABLE appconfig ADD COLUMN IF NOT EXISTS llm_api_key TEXT;
ALTER TABLE appconfig ADD COLUMN IF NOT EXISTS llm_base_url TEXT;
ALTER TABLE appconfig ADD COLUMN IF NOT EXISTS llm_model TEXT;
ALTER TABLE appconfig ADD COLUMN IF NOT EXISTS app_name TEXT NOT NULL DEFAULT 'Snatcher';
ALTER TABLE appconfig ADD COLUMN IF NOT EXISTS app_domain TEXT;

-- migrate:down
-- noop
