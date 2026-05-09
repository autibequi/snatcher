-- migrate:up
-- Temperatura opcional: quando NULL, cada prompt YAML mantém o próprio default.
ALTER TABLE appconfig ADD COLUMN IF NOT EXISTS llm_temperature DOUBLE PRECISION;

-- migrate:down
ALTER TABLE appconfig DROP COLUMN IF EXISTS llm_temperature;
