-- Reverte para regra anterior (sem exigir brand_id na fila).

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
