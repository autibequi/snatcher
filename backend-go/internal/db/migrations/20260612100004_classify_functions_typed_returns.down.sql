-- Reverte para a forma com literais bare (re-introduz o bug — apenas para rollback formal).
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

    IF v_slug IS NULL OR btrim(v_slug) = '' THEN
        RETURN ('', 0.0);
    END IF;
    RETURN (v_slug, v_confidence);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION classify_catalog_category(p_title TEXT, p_source TEXT DEFAULT '')
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
