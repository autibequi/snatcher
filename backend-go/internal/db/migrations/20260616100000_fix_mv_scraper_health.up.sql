-- mv_scraper_health estava lendo de extraction_logs, que nunca é populada
-- (extraction_logs é para extração CSS por seletor — feature não implementada).
-- A pipeline de crawl escreve em crawllog com source_counts JSON por fonte.
-- Recria a view lendo crawllog expandido por fonte, janela de 24h.

DROP MATERIALIZED VIEW IF EXISTS mv_scraper_health;

CREATE MATERIALIZED VIEW mv_scraper_health AS
SELECT
    kv.key                                                          AS source_id,
    'crawl'::text                                                   AS field,
    COUNT(*)::int                                                   AS attempts,
    SUM(CASE WHEN cl.status = 'done' AND kv.value::int > 0 THEN 1 ELSE 0 END)::numeric
        / NULLIF(COUNT(*), 0)                                       AS success_rate,
    now()                                                           AS computed_at
FROM crawllog cl
CROSS JOIN LATERAL jsonb_each_text(cl.source_counts::jsonb) AS kv(key, value)
WHERE cl.started_at > now() - INTERVAL '24 hours'
  AND cl.source_counts IS NOT NULL
  AND cl.source_counts <> 'null'
GROUP BY kv.key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_mv_scraper_health ON mv_scraper_health (source_id, field);
