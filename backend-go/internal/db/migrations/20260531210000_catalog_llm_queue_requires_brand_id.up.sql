-- Fila catalog_llm_queue: "completo" só com marca (texto), brand_id (FK product_brands) e category_id.
-- Impede remover da fila quando só há slug sem brand_id ou dados incompletos.

CREATE OR REPLACE FUNCTION trg_catalog_llm_queue_sync() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.title IS NOT NULL AND btrim(NEW.title) <> '' THEN
        IF (NEW.brand IS NULL OR btrim(NEW.brand) = '')
           OR (NEW.category_id IS NULL)
           OR (NEW.brand_id IS NULL) THEN
            INSERT INTO catalog_llm_queue (catalog_id, status, reason)
            VALUES (
                NEW.id,
                'pending',
                CASE
                    WHEN NEW.brand IS NULL OR btrim(NEW.brand) = '' THEN 'no_brand_keyword_match'
                    WHEN NEW.category_id IS NULL THEN 'no_category_keyword_match'
                    ELSE 'no_brand_id_match'
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
    AFTER INSERT OR UPDATE OF title, source_id, brand, brand_id, category_id ON catalog
    FOR EACH ROW EXECUTE FUNCTION trg_catalog_llm_queue_sync();

-- Remove fila só onde catálogo está realmente completo
DELETE FROM catalog_llm_queue q
USING catalog c
WHERE q.catalog_id = c.id
  AND c.brand IS NOT NULL AND btrim(c.brand) <> ''
  AND c.category_id IS NOT NULL
  AND c.brand_id IS NOT NULL;

-- Re-enfileira incompletos (inclui brand_id NULL com slug preenchido)
INSERT INTO catalog_llm_queue (catalog_id, status, reason)
SELECT id, 'pending',
  CASE
    WHEN brand IS NULL OR btrim(brand) = '' THEN 'no_brand_keyword_match'
    WHEN category_id IS NULL THEN 'no_category_keyword_match'
    ELSE 'no_brand_id_match'
  END
FROM catalog
WHERE title IS NOT NULL AND btrim(title) <> ''
  AND (
    brand IS NULL OR btrim(brand) = ''
    OR category_id IS NULL
    OR brand_id IS NULL
  )
ON CONFLICT (catalog_id) DO UPDATE SET
  status = CASE WHEN catalog_llm_queue.status = 'processing' THEN catalog_llm_queue.status ELSE 'pending' END,
  reason = EXCLUDED.reason,
  enqueued_at = CASE WHEN catalog_llm_queue.status = 'processing' THEN catalog_llm_queue.enqueued_at ELSE now() END,
  processed_at = NULL,
  last_error = NULL;
