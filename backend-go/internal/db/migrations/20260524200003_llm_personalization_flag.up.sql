-- Flag para personalizar mensagens via LLM antes de enviar (evita parecer spam automático).
-- Default OFF — liga somente quando configurado em Settings.
ALTER TABLE appconfig ADD COLUMN IF NOT EXISTS use_llm_personalization BOOLEAN NOT NULL DEFAULT false;
