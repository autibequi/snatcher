-- Tipo composto retornado pelas funções de classificação v2
-- Permite acesso por campo: (classify_catalog_brand(...)).slug, .confidence
DO $$ BEGIN
    CREATE TYPE taxonomy_match AS (slug TEXT, confidence NUMERIC);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- classify_catalog_brand(p_title TEXT) RETURNS taxonomy_match
-- Lê de taxonomy_node WHERE kind='brand'
-- Match via ILIKE '%slug%' no título, ordena por confidence_pct DESC
-- Retorna ('', 0.0) quando sem match — nunca NULL
CREATE OR REPLACE FUNCTION classify_catalog_brand(p_title TEXT)
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

    IF v_slug IS NULL THEN
        RETURN ('', 0.0);
    END IF;
    RETURN (v_slug, v_confidence);
END;
$$ LANGUAGE plpgsql;

-- classify_catalog_category(p_title TEXT) RETURNS taxonomy_match
-- Lê de taxonomy_node WHERE kind='category'
-- Match via ILIKE no slug ou name_pt, ordena por confidence_pct DESC
-- Retorna ('', 0.0) quando sem match — nunca NULL
CREATE OR REPLACE FUNCTION classify_catalog_category(p_title TEXT)
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

    IF v_slug IS NULL THEN
        RETURN ('', 0.0);
    END IF;
    RETURN (v_slug, v_confidence);
END;
$$ LANGUAGE plpgsql;
