-- Adiciona coluna weight em brand_keywords e category_keywords para resolver
-- falsos positivos de categorização (anteriormente: ORDER BY id = primeiro pattern
-- inserido vence, independente da especificidade).
-- Maior weight = mais específico/prioritário.

ALTER TABLE brand_keywords ADD COLUMN IF NOT EXISTS weight INT NOT NULL DEFAULT 100;

-- Padrões mais genéricos recebem weight menor para não roubar match de patterns específicos.
-- Ex: '%lg %' (genérico) < '%lg oled%' (específico, ainda não seedado mas se adicionado vence).
UPDATE brand_keywords SET weight = 80  WHERE pattern IN ('%lg %', '%fila %', '%natura %');
UPDATE brand_keywords SET weight = 90  WHERE pattern IN ('%growth%', '%lg%');
UPDATE brand_keywords SET weight = 120 WHERE pattern IN ('%samsung%', '%apple%', '%nike%', '%adidas%', '%razer%', '%logitech%');

-- Índice pra ORDER BY weight DESC ser rápido
CREATE INDEX IF NOT EXISTS idx_brand_keywords_weight ON brand_keywords(weight DESC, id ASC) WHERE active = true;

-- Atualiza função para usar weight DESC, id ASC.
-- DROP antes do CREATE: a 608 redefiniu esta função como RETURNS taxonomy_match; aqui ela
-- volta a RETURNS TEXT, e o Postgres não permite mudar o tipo de retorno via OR REPLACE
-- (quebrava o boot num banco fresh — "cannot change return type of existing function").
DROP FUNCTION IF EXISTS classify_catalog_brand(TEXT);
CREATE OR REPLACE FUNCTION classify_catalog_brand(p_title TEXT)
RETURNS TEXT AS $$
DECLARE v_brand TEXT;
BEGIN
    SELECT bk.brand_slug INTO v_brand
    FROM brand_keywords bk
    WHERE bk.active = true
      AND LOWER(p_title) ILIKE bk.pattern
    ORDER BY bk.weight DESC, bk.id ASC
    LIMIT 1;
    RETURN v_brand;
END;
$$ LANGUAGE plpgsql;
