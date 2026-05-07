-- migrate:up
-- Adiciona prompt enviado e response recebida em cada exec do LLM (debug/auditoria).
ALTER TABLE llm_metrics ADD COLUMN IF NOT EXISTS prompt TEXT;
ALTER TABLE llm_metrics ADD COLUMN IF NOT EXISTS response TEXT;

-- migrate:down
ALTER TABLE llm_metrics DROP COLUMN IF EXISTS prompt;
ALTER TABLE llm_metrics DROP COLUMN IF EXISTS response;
