-- URLs/modelos separados para Ollama vs vLLM (evita sobrescrever ao trocar de card).
-- API key do vLLM fica em llm_vllm_api_key; OpenRouter continua em llm_api_key.

ALTER TABLE appconfig ADD COLUMN IF NOT EXISTS llm_ollama_base_url TEXT;
ALTER TABLE appconfig ADD COLUMN IF NOT EXISTS llm_ollama_model TEXT;
ALTER TABLE appconfig ADD COLUMN IF NOT EXISTS llm_vllm_base_url TEXT;
ALTER TABLE appconfig ADD COLUMN IF NOT EXISTS llm_vllm_model TEXT;
ALTER TABLE appconfig ADD COLUMN IF NOT EXISTS llm_vllm_api_key TEXT;

UPDATE appconfig SET
	llm_ollama_base_url = llm_base_url,
	llm_ollama_model = llm_model
WHERE id = 1 AND llm_provider = 'ollama';

UPDATE appconfig SET
	llm_vllm_base_url = llm_base_url,
	llm_vllm_model = llm_model,
	llm_vllm_api_key = llm_api_key
WHERE id = 1 AND llm_provider = 'vllm';
