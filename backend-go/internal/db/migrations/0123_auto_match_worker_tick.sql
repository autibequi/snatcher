-- migrate:up
-- Marca cada execução do worker de auto-match (mesmo quando 0 dispatches),
-- para o countdown na UI não depender só de auto_match_logs.
ALTER TABLE appconfig ADD COLUMN IF NOT EXISTS auto_match_last_worker_run_at TIMESTAMPTZ;

-- migrate:down
ALTER TABLE appconfig DROP COLUMN IF EXISTS auto_match_last_worker_run_at;
