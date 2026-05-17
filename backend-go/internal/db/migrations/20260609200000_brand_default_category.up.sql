-- Mapeamento brand_slug → category_slug padrão.
-- Usado como fallback quando classify_catalog_category(title) não resolve
-- mas o brand já foi identificado (ex: título="NIKE" → brand=nike → category=esporte).
-- Editável pelo admin/Jonfrey sem deploy.

ALTER TABLE brand_keywords ADD COLUMN IF NOT EXISTS default_category_slug TEXT;

-- Seeds: marcas com categoria óbvia pelo nome da marca
UPDATE brand_keywords SET default_category_slug = 'esporte'     WHERE brand_slug IN ('nike','adidas','puma','reebok','asics','mizuno','fila','under-armour','new-balance','saucony','converse','vans','olympikus');
UPDATE brand_keywords SET default_category_slug = 'gaming'      WHERE brand_slug IN ('razer','corsair','hyperx','logitech','steelseries','asus');
UPDATE brand_keywords SET default_category_slug = 'eletronico'  WHERE brand_slug IN ('samsung','apple','lenovo','lg','asus');
UPDATE brand_keywords SET default_category_slug = 'cosmetico'   WHERE brand_slug IN ('avon','natura','boticario','maybelline','loreal','nars');
UPDATE brand_keywords SET default_category_slug = 'suplemento'  WHERE brand_slug IN ('vitafor','growth','max-titanium','integralmedica','probiotica');

-- Função de fallback: retorna category_slug default do brand se a heurística de título falhou
CREATE OR REPLACE FUNCTION classify_category_from_brand(p_brand_slug TEXT)
RETURNS BIGINT AS $$
DECLARE v_cat_id BIGINT;
BEGIN
    IF p_brand_slug IS NULL OR p_brand_slug = '' THEN RETURN NULL; END IF;

    SELECT cat.id INTO v_cat_id
    FROM brand_keywords bk
    JOIN categories cat ON cat.slug = bk.default_category_slug
    WHERE bk.brand_slug = p_brand_slug
      AND bk.default_category_slug IS NOT NULL
      AND bk.active = true
    LIMIT 1;

    RETURN v_cat_id;
END;
$$ LANGUAGE plpgsql;
