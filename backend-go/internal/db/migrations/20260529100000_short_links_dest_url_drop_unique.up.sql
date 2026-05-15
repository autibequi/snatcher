-- Vários short_id distintos (dispatch por grupo/catálogo) podem apontar para a
-- mesma dest_url de afiliado — o UNIQUE(dest_url) impedia o envio nesse caso.
ALTER TABLE short_links DROP CONSTRAINT IF EXISTS short_links_dest_url_key;
CREATE INDEX IF NOT EXISTS idx_short_links_dest_url ON short_links (dest_url);
