-- Tipo composto retornado pelas funções de classificação v2
-- Permite acesso por campo: (classify_catalog_brand(...)).slug, .confidence
DO $$ BEGIN
    CREATE TYPE taxonomy_match AS (slug TEXT, confidence NUMERIC);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Postgres não permite CREATE OR REPLACE quando muda o tipo de retorno (TEXT/BIGINT → taxonomy_match).
DROP FUNCTION IF EXISTS classify_catalog_category(TEXT, TEXT);
DROP FUNCTION IF EXISTS classify_catalog_brand(TEXT);

-- classify_catalog_brand(p_title TEXT) RETURNS taxonomy_match
-- Lê de taxonomy_node WHERE kind='brand'
-- Match via ILIKE '%slug%' no título, ordena por confidence_pct DESC
-- Retorna ('', 0.0) quando sem match — nunca NULL
CREATE FUNCTION classify_catalog_brand(p_title TEXT)
RETURNS taxonomy_match AS $$
DECLARE
    v_slug       TEXT;
    v_confidence NUMERIC;
BEGIN
    SELECT tn.slug, tn.confidence_pct / 100.0
    INTO v_slug, v_confidence
    FROM taxonomy_node tn
    WHERE tn.kind = 'brand'
      AND tn.confidence_pct > 0
      AND LOWER(p_title) ILIKE '%' || tn.slug || '%'
    ORDER BY tn.confidence_pct DESC
    LIMIT 1;

    IF v_slug IS NULL OR btrim(v_slug) = '' THEN
        RETURN ('', 0.0);
    END IF;
    RETURN (v_slug, v_confidence);
END;
$$ LANGUAGE plpgsql;

-- classify_catalog_category(p_title TEXT, p_source TEXT) RETURNS taxonomy_match
-- Mantém assinatura (text, text) para triggers e SQL legado; p_source ignorado (comportamento anterior).
-- Lê de taxonomy_node WHERE kind='category'
CREATE FUNCTION classify_catalog_category(p_title TEXT, p_source TEXT DEFAULT '')
RETURNS taxonomy_match AS $$
DECLARE
    v_slug       TEXT;
    v_confidence NUMERIC;
BEGIN
    SELECT tn.slug, tn.confidence_pct / 100.0
    INTO v_slug, v_confidence
    FROM taxonomy_node tn
    WHERE tn.kind = 'category'
      AND tn.confidence_pct > 0
      AND (
          LOWER(p_title) ILIKE '%' || tn.slug || '%'
          OR LOWER(p_title) ILIKE '%' || LOWER(tn.name_pt) || '%'
      )
    ORDER BY tn.confidence_pct DESC
    LIMIT 1;

    IF v_slug IS NULL OR btrim(v_slug) = '' THEN
        RETURN ('', 0.0);
    END IF;
    RETURN (v_slug, v_confidence);
END;
$$ LANGUAGE plpgsql;

-- Trigger catalog: extrai .slug e resolve category_id via categories.slug
CREATE OR REPLACE FUNCTION trg_catalog_auto_classify() RETURNS TRIGGER AS $$
DECLARE
    v_brand taxonomy_match;
    v_cat   taxonomy_match;
BEGIN
    IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND (
        NEW.title IS DISTINCT FROM OLD.title OR NEW.source_id IS DISTINCT FROM OLD.source_id
    )) THEN
        IF NEW.title IS NOT NULL AND btrim(NEW.title) <> '' THEN
            v_brand := classify_catalog_brand(NEW.title);
            IF v_brand.slug IS NOT NULL AND btrim(v_brand.slug) <> '' THEN
                NEW.brand := v_brand.slug;
                INSERT INTO product_brands (slug, display_name)
                VALUES (NEW.brand, NEW.brand)
                ON CONFLICT (slug) DO NOTHING;
                SELECT id INTO NEW.brand_id FROM product_brands WHERE slug = NEW.brand LIMIT 1;
                IF NEW.category_id IS NULL THEN
                    v_cat := classify_catalog_category(NEW.title, COALESCE(NEW.source_id::text, ''));
                    IF v_cat.slug IS NOT NULL AND btrim(v_cat.slug) <> '' THEN
                        SELECT id INTO NEW.category_id FROM categories WHERE slug = v_cat.slug LIMIT 1;
                    END IF;
                END IF;
            ELSE
                NEW.brand := NULL;
                NEW.brand_id := NULL;
                NEW.category_id := NULL;
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
