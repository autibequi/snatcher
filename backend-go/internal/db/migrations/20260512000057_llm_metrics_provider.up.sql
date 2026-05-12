-- Provider da chamada (ollama | vllm | openrouter) para filtros e lista de logs admin.
ALTER TABLE llm_metrics ADD COLUMN IF NOT EXISTS provider VARCHAR(32) NOT NULL DEFAULT '';
