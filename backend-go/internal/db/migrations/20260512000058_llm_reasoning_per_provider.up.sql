-- Reasoning habilitado por backend (ollama / vllm / openrouter), não mais um único flag global.
ALTER TABLE appconfig ADD COLUMN IF NOT EXISTS llm_reasoning_ollama BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE appconfig ADD COLUMN IF NOT EXISTS llm_reasoning_vllm BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE appconfig ADD COLUMN IF NOT EXISTS llm_reasoning_openrouter BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE appconfig SET
  llm_reasoning_ollama = llm_reasoning_enabled,
  llm_reasoning_vllm = llm_reasoning_enabled,
  llm_reasoning_openrouter = llm_reasoning_enabled
WHERE id = 1;

ALTER TABLE appconfig DROP COLUMN IF EXISTS llm_reasoning_enabled;
