-- migrate:up
-- Metadata enriquecida do crawler — armazena info adicional pra inferência (LLM)
-- e copy de anúncio (composer): descrição, rating, reviews, vendedor, frete, etc.
ALTER TABLE crawlresult ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- Espelhada em catalogvariant pra disponibilizar no momento do disparo
ALTER TABLE catalogvariant ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_crawlresult_metadata
  ON crawlresult USING GIN (metadata);

-- migrate:down
ALTER TABLE crawlresult DROP COLUMN IF EXISTS metadata;
ALTER TABLE catalogvariant DROP COLUMN IF EXISTS metadata;
