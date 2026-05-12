-- Anúncios pagos: campos de cobrança e tracking de cliques agregados.
ALTER TABLE ads ADD COLUMN IF NOT EXISTS client_name TEXT NOT NULL DEFAULT '';
ALTER TABLE ads ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS short_id TEXT;  -- short link único pro anúncio (rastreia cliques)
ALTER TABLE ads ADD COLUMN IF NOT EXISTS click_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS target_url TEXT NOT NULL DEFAULT ''; -- destino real do anúncio

CREATE UNIQUE INDEX IF NOT EXISTS idx_ads_short_id ON ads(short_id) WHERE short_id IS NOT NULL;
