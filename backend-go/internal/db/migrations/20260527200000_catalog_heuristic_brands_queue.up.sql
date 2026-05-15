-- Marcas canónicas (além de brand_keywords / texto em catalog.brand)
CREATE TABLE IF NOT EXISTS product_brands (
    id           BIGSERIAL PRIMARY KEY,
    slug         TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO product_brands (slug, display_name)
SELECT brand_slug, MAX(brand_display)
FROM brand_keywords
GROUP BY brand_slug
ON CONFLICT (slug) DO UPDATE SET display_name = EXCLUDED.display_name;

ALTER TABLE catalog ADD COLUMN IF NOT EXISTS brand_id BIGINT REFERENCES product_brands(id);
UPDATE catalog c
SET brand_id = pb.id
FROM product_brands pb
WHERE c.brand IS NOT NULL AND pb.slug = c.brand AND (c.brand_id IS NULL OR c.brand_id <> pb.id);

-- Fila: produtos sem marca heurística → enriquecimento LLM (worker separado)
CREATE TABLE IF NOT EXISTS catalog_llm_queue (
    catalog_id  BIGINT PRIMARY KEY REFERENCES catalog(id) ON DELETE CASCADE,
    status      TEXT NOT NULL DEFAULT 'pending',
    reason      TEXT,
    enqueued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    processed_at TIMESTAMPTZ,
    last_error  TEXT,
    CONSTRAINT catalog_llm_queue_status_check CHECK (status IN ('pending', 'processing', 'done', 'error'))
);
CREATE INDEX IF NOT EXISTS idx_catalog_llm_queue_status ON catalog_llm_queue(status) WHERE status = 'pending';

-- Palavra-chave ambígua (%base% = maquiagem vs "base de carregamento")
DELETE FROM category_keywords WHERE pattern = '%base%' AND category_slug = 'cosmetico';

-- Marca: maior número de patterns que batem; desempate = pattern mais longo (mais específico)
CREATE OR REPLACE FUNCTION classify_catalog_brand(p_title TEXT)
RETURNS TEXT AS $$
WITH hits AS (
    SELECT bk.brand_slug, LENGTH(bk.pattern) AS pat_len
    FROM brand_keywords bk
    WHERE bk.active = true
      AND p_title IS NOT NULL
      AND btrim(p_title) <> ''
      AND LOWER(p_title) ILIKE bk.pattern
),
agg AS (
    SELECT brand_slug,
           COUNT(*)::bigint AS n_hit,
           MAX(pat_len)     AS max_len
    FROM hits
    GROUP BY brand_slug
)
SELECT a.brand_slug
FROM agg a
ORDER BY a.n_hit DESC, a.max_len DESC, a.brand_slug ASC
LIMIT 1;
$$ LANGUAGE sql STABLE;

-- Categoria: mesma lógica (soma de hits + pattern mais longo), fallback geral
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
SELECT COALESCE(
    (SELECT id FROM categories WHERE slug = (SELECT category_slug FROM winner)),
    (SELECT id FROM categories WHERE slug = 'geral' LIMIT 1)
);
$$ LANGUAGE sql STABLE;

-- Trigger: 1) marca 2) só categoria se achou marca (heurística sem LLM)
CREATE OR REPLACE FUNCTION trg_catalog_auto_classify() RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND (
        NEW.title IS DISTINCT FROM OLD.title OR NEW.source_id IS DISTINCT FROM OLD.source_id
    )) THEN
        IF NEW.title IS NOT NULL AND btrim(NEW.title) <> '' THEN
            NEW.brand := classify_catalog_brand(NEW.title);
            IF NEW.brand IS NOT NULL THEN
                INSERT INTO product_brands (slug, display_name)
                VALUES (NEW.brand, NEW.brand)
                ON CONFLICT (slug) DO NOTHING;
                SELECT id INTO NEW.brand_id FROM product_brands WHERE slug = NEW.brand LIMIT 1;
                IF NEW.category_id IS NULL THEN
                    NEW.category_id := classify_catalog_category(NEW.title, COALESCE(NEW.source_id::text, ''));
                END IF;
            ELSE
                NEW.brand_id := NULL;
                -- Sem marca heurística: não categorizar por keyword (fila LLM assume enriquecimento).
                NEW.category_id := NULL;
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Após persistir: enfileira itens sem marca; remove da fila quando marca existe
CREATE OR REPLACE FUNCTION trg_catalog_llm_queue_sync() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.title IS NOT NULL AND btrim(NEW.title) <> '' AND NEW.brand IS NULL THEN
        INSERT INTO catalog_llm_queue (catalog_id, status, reason)
        VALUES (NEW.id, 'pending', 'no_brand_keyword_match')
        ON CONFLICT (catalog_id) DO UPDATE SET
            status = CASE WHEN catalog_llm_queue.status = 'processing' THEN catalog_llm_queue.status ELSE 'pending' END,
            reason = EXCLUDED.reason,
            enqueued_at = CASE WHEN catalog_llm_queue.status = 'processing' THEN catalog_llm_queue.enqueued_at ELSE now() END,
            processed_at = NULL,
            last_error = NULL;
    ELSIF NEW.brand IS NOT NULL THEN
        DELETE FROM catalog_llm_queue WHERE catalog_id = NEW.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS catalog_llm_queue_sync ON catalog;
CREATE TRIGGER catalog_llm_queue_sync
    AFTER INSERT OR UPDATE OF title, source_id, brand ON catalog
    FOR EACH ROW EXECUTE FUNCTION trg_catalog_llm_queue_sync();

-- Consistência pós-migration: fila só para catálogo sem marca
DELETE FROM catalog_llm_queue q
USING catalog c
WHERE q.catalog_id = c.id AND c.brand IS NOT NULL AND btrim(c.brand) <> '';

INSERT INTO catalog_llm_queue (catalog_id, status, reason)
SELECT id, 'pending', 'no_brand_keyword_match'
FROM catalog
WHERE title IS NOT NULL AND btrim(title) <> ''
  AND (brand IS NULL OR btrim(brand) = '')
ON CONFLICT (catalog_id) DO NOTHING;
