-- OpenRouter: segunda opção na lista models[] quando o primário falha (errors, rate limit, moderation).
-- Doc: https://openrouter.ai/docs/guides/routing/model-fallbacks
ALTER TABLE appconfig ADD COLUMN IF NOT EXISTS llm_openrouter_fallback_model TEXT;

UPDATE appconfig
SET llm_model = 'openrouter/free'
WHERE id = 1
  AND (llm_model IS NULL OR trim(llm_model) = '');
