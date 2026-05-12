ALTER TABLE crawlresult ADD COLUMN IF NOT EXISTS source_subid TEXT;
CREATE INDEX IF NOT EXISTS ix_crawlresult_source_subid ON crawlresult(source, source_subid);
