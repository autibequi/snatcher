-- Adiciona prompt enviado e response recebida em cada exec do LLM (debug/auditoria).
ALTER TABLE llm_metrics ADD COLUMN IF NOT EXISTS prompt TEXT;
ALTER TABLE llm_metrics ADD COLUMN IF NOT EXISTS response TEXT;
