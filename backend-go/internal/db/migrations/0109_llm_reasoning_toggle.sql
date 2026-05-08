-- migrate:up
ALTER TABLE appconfig ADD COLUMN IF NOT EXISTS llm_reasoning_enabled BOOLEAN NOT NULL DEFAULT FALSE;

-- migrate:down
-- noop
