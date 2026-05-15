DROP INDEX IF EXISTS idx_short_links_dest_url;
-- Só aplica se não houver dest_url duplicados (após up, normalmente há).
ALTER TABLE short_links ADD CONSTRAINT short_links_dest_url_key UNIQUE (dest_url);
