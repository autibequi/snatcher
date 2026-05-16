DROP INDEX IF EXISTS idx_brand_keywords_weight;
ALTER TABLE brand_keywords DROP COLUMN IF EXISTS weight;

-- Restaura função original (ORDER BY id)
CREATE OR REPLACE FUNCTION classify_catalog_brand(p_title TEXT)
RETURNS TEXT AS $$
DECLARE v_brand TEXT;
BEGIN
    SELECT bk.brand_slug INTO v_brand
    FROM brand_keywords bk
    WHERE bk.active = true
      AND LOWER(p_title) ILIKE bk.pattern
    ORDER BY bk.id
    LIMIT 1;
    RETURN v_brand;
END;
$$ LANGUAGE plpgsql;
