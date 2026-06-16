-- Recria mv_scraper_health com suporte às colunas legacy (ml_count/amz_count).
-- A versão anterior só lia source_counts (JSON), que nunca é populado pelo
-- InsertCrawlLog atual — causando MV sempre vazia.
-- Usa UNION para cobrir ambos os formatos; a lógica espelha GetSourceCounts() em Go.

DROP MATERIALIZED VIEW IF EXISTS mv_scraper_health;

CREATE MATERIALIZED VIEW mv_scraper_health AS
WITH sources AS (
    -- Novo formato: source_counts JSON (future-proof)
    SELECT
        kv.key::text  AS source_id,
        cl.status,
        kv.value::int AS cnt
    FROM crawllog cl
    CROSS JOIN LATERAL jsonb_each_text(cl.source_counts::jsonb) AS kv(key, value)
    WHERE cl.started_at > now() - INTERVAL '24 hours'
      AND cl.source_counts IS NOT NULL
      AND cl.source_counts <> 'null'

    UNION ALL

    -- Formato legacy: ml_count
    SELECT 'ml'::text, cl.status, cl.ml_count
    FROM crawllog cl
    WHERE cl.started_at > now() - INTERVAL '24 hours'
      AND (cl.source_counts IS NULL OR cl.source_counts = 'null')

    UNION ALL

    -- Formato legacy: amz_count
    SELECT 'amz'::text, cl.status, cl.amz_count
    FROM crawllog cl
    WHERE cl.started_at > now() - INTERVAL '24 hours'
      AND (cl.source_counts IS NULL OR cl.source_counts = 'null')
)
SELECT
    source_id,
    'crawl'::text             AS field,
    COUNT(*)::int             AS attempts,
    SUM(CASE WHEN status = 'done' AND cnt > 0 THEN 1 ELSE 0 END)::numeric
        / NULLIF(COUNT(*), 0) AS success_rate,
    now()                     AS computed_at
FROM sources
GROUP BY source_id;

CREATE UNIQUE INDEX IF NOT EXISTS uq_mv_scraper_health
    ON mv_scraper_health (source_id, field);
