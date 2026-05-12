ALTER TABLE appconfig ADD COLUMN IF NOT EXISTS llm_reasoning_enabled BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE appconfig SET
  llm_reasoning_enabled = (llm_reasoning_ollama OR llm_reasoning_vllm OR llm_reasoning_openrouter)
WHERE id = 1;
ALTER TABLE appconfig DROP COLUMN IF EXISTS llm_reasoning_ollama;
ALTER TABLE appconfig DROP COLUMN IF EXISTS llm_reasoning_vllm;
ALTER TABLE appconfig DROP COLUMN IF EXISTS llm_reasoning_openrouter;
