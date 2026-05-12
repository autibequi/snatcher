-- Drop affiliate fields from SearchTerm and AppConfig
-- In Postgres, ALTER TABLE DROP COLUMN is supported directly

-- Drop affiliate fields from searchterm
ALTER TABLE searchterm DROP COLUMN IF EXISTS ml_affiliate_tool_id;
ALTER TABLE searchterm DROP COLUMN IF EXISTS amz_tracking_id;

-- Drop affiliate fields from appconfig
ALTER TABLE appconfig DROP COLUMN IF EXISTS ml_affiliate_tool_id;
ALTER TABLE appconfig DROP COLUMN IF EXISTS amz_tracking_id;
