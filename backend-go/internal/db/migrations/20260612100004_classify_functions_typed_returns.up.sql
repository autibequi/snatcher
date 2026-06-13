-- Fix: classify_catalog_brand / classify_catalog_category devolviam ('', 0.0)
-- com literais bare. O Postgres trata '' como tipo 'unknown'; quando o caller faz
-- `(classify_catalog_brand(t)).slug` o engine precisa re-resolver o composite
-- taxonomy_match e falha o cast unknown→text:
--   ERROR: returned record type does not match expected record type
--   DETAIL: Returned type unknown does not match expected type text in column 1.
--
-- Sintoma observado em prod: 100% dos itens da catalog_llm_queue travavam na
-- heurística (catalog_llm_queue.go:155), fila parou de drenar.
--
-- Fix: cast explícito (''::text, 0.0::numeric).
-- DROP antes do CREATE: a 609 deixou esta função como RETURNS TEXT; aqui ela volta a
-- RETURNS taxonomy_match, e OR REPLACE não pode mudar o tipo de retorno (quebrava o boot
-- num banco fresh). classify_catalog_brand é chamada dentro de outra função, não é handler
-- de trigger, então o DROP não derruba dependências.
DROP FUNCTION IF EXISTS classify_catalog_brand(TEXT);
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
        RETURN (''::text, 0.0::numeric);
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
        RETURN (''::text, 0.0::numeric);
    END IF;
    RETURN (v_slug, v_confidence);
END;
$$ LANGUAGE plpgsql;
