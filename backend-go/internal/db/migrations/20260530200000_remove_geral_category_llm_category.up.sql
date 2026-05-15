-- Remove categoria 'geral' (dados + linha). Sem fallback em classify: sem keyword → category_id NULL.
-- Produto sem categoria entra na fila LLM (reason no_category_keyword_match) e não segue heurística só com marca.

DO $$
DECLARE
    gid BIGINT;
    fallback_id BIGINT;
BEGIN
    SELECT id INTO gid FROM categories WHERE slug = 'geral' LIMIT 1;
    IF gid IS NOT NULL THEN
        SELECT id INTO fallback_id FROM categories WHERE slug = 'eletronico' LIMIT 1;
        IF fallback_id IS NULL THEN
            SELECT id INTO fallback_id FROM categories ORDER BY id LIMIT 1;
        END IF;

        UPDATE templates SET category_id = fallback_id WHERE category_id = gid;
        UPDATE catalog SET category_id = NULL WHERE category_id = gid;
        UPDATE groups SET category_id = NULL WHERE category_id = gid;
        -- channels_v2.category_id foi removida em 20260523200000 (pesos em channel_category_weights).

        DELETE FROM channel_category_weights WHERE category_id = gid;
        DELETE FROM group_category_affinity WHERE category_id = gid;
        DELETE FROM bandit_arms WHERE category_id = gid;
        DELETE FROM bandit_arms_channel WHERE category_id = gid;
        DELETE FROM learned_weights WHERE category_id = gid;
        DELETE FROM learned_weights_channel WHERE category_id = gid;
        DELETE FROM taxonomy_rules WHERE category_id = gid;

        DELETE FROM categories WHERE id = gid;
    END IF;
END $$;

CREATE OR REPLACE FUNCTION classify_catalog_category(p_title TEXT, p_source TEXT DEFAULT '')
RETURNS BIGINT AS $$
WITH hits AS (
    SELECT ck.category_slug, LENGTH(ck.pattern) AS pat_len
    FROM category_keywords ck
    WHERE ck.active = true
      AND p_title IS NOT NULL
      AND btrim(p_title) <> ''
      AND LOWER(p_title) ILIKE ck.pattern
),
agg AS (
    SELECT category_slug,
           COUNT(*)::bigint AS n_hit,
           MAX(pat_len)     AS max_len
    FROM hits
    GROUP BY category_slug
),
winner AS (
    SELECT a.category_slug
    FROM agg a
    ORDER BY a.n_hit DESC, a.max_len DESC, a.category_slug ASC
    LIMIT 1
)
SELECT (SELECT id FROM categories c WHERE c.slug = (SELECT category_slug FROM winner) LIMIT 1);
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION trg_catalog_llm_queue_sync() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.title IS NOT NULL AND btrim(NEW.title) <> '' THEN
        IF (NEW.brand IS NULL OR btrim(NEW.brand) = '') OR (NEW.category_id IS NULL) THEN
            INSERT INTO catalog_llm_queue (catalog_id, status, reason)
            VALUES (
                NEW.id,
                'pending',
                CASE
                    WHEN NEW.brand IS NULL OR btrim(NEW.brand) = '' THEN 'no_brand_keyword_match'
                    ELSE 'no_category_keyword_match'
                END
            )
            ON CONFLICT (catalog_id) DO UPDATE SET
                status = CASE WHEN catalog_llm_queue.status = 'processing' THEN catalog_llm_queue.status ELSE 'pending' END,
                reason = EXCLUDED.reason,
                enqueued_at = CASE WHEN catalog_llm_queue.status = 'processing' THEN catalog_llm_queue.enqueued_at ELSE now() END,
                processed_at = NULL,
                last_error = NULL;
        ELSE
            DELETE FROM catalog_llm_queue WHERE catalog_id = NEW.id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS catalog_llm_queue_sync ON catalog;
CREATE TRIGGER catalog_llm_queue_sync
    AFTER INSERT OR UPDATE OF title, source_id, brand, category_id ON catalog
    FOR EACH ROW EXECUTE FUNCTION trg_catalog_llm_queue_sync();

-- Sincroniza fila: fora só com marca + categoria
DELETE FROM catalog_llm_queue q
USING catalog c
WHERE q.catalog_id = c.id
  AND c.brand IS NOT NULL AND btrim(c.brand) <> ''
  AND c.category_id IS NOT NULL;

INSERT INTO catalog_llm_queue (catalog_id, status, reason)
SELECT id, 'pending',
  CASE
    WHEN brand IS NULL OR btrim(brand) = '' THEN 'no_brand_keyword_match'
    ELSE 'no_category_keyword_match'
  END
FROM catalog
WHERE title IS NOT NULL AND btrim(title) <> ''
  AND (
    brand IS NULL OR btrim(brand) = ''
    OR category_id IS NULL
  )
ON CONFLICT (catalog_id) DO UPDATE SET
  status = CASE WHEN catalog_llm_queue.status = 'processing' THEN catalog_llm_queue.status ELSE 'pending' END,
  reason = EXCLUDED.reason,
  enqueued_at = CASE WHEN catalog_llm_queue.status = 'processing' THEN catalog_llm_queue.enqueued_at ELSE now() END,
  processed_at = NULL,
  last_error = NULL;
