DROP MATERIALIZED VIEW IF EXISTS mv_scraper_health;

CREATE MATERIALIZED VIEW mv_scraper_health AS
SELECT
    el.source_id,
    el.field,
    COUNT(*) AS attempts,
    SUM(CASE WHEN el.extraction_successful THEN 1 ELSE 0 END)::numeric / NULLIF(COUNT(*), 0) AS success_rate,
    now() AS computed_at
FROM extraction_logs el
WHERE el.attempted_at > now() - INTERVAL '1 hour'
GROUP BY el.source_id, el.field;

CREATE UNIQUE INDEX IF NOT EXISTS uq_mv_scraper_health ON mv_scraper_health (source_id, field);
