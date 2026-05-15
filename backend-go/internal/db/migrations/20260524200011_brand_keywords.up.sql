CREATE TABLE IF NOT EXISTS brand_keywords (
    id            BIGSERIAL PRIMARY KEY,
    brand_slug    TEXT NOT NULL,         -- 'nike', 'adidas', 'mizuno'
    brand_display TEXT NOT NULL,         -- 'Nike', 'Adidas', 'Mizuno' (nome de exibição)
    pattern       TEXT NOT NULL,         -- formato ILIKE: %nike%
    active        BOOLEAN NOT NULL DEFAULT true,
    source        TEXT NOT NULL DEFAULT 'seed',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (brand_slug, pattern)
);
CREATE INDEX IF NOT EXISTS idx_brand_keywords_slug ON brand_keywords(brand_slug) WHERE active = true;

-- Seed inicial de marcas conhecidas (editável pelo admin/Jonfrey)
INSERT INTO brand_keywords (brand_slug, brand_display, pattern, source) VALUES
  -- Esporte/Tênis
  ('nike',          'Nike',              '%nike%',         'seed'),
  ('adidas',        'Adidas',            '%adidas%',       'seed'),
  ('mizuno',        'Mizuno',            '%mizuno%',       'seed'),
  ('olympikus',     'Olympikus',         '%olympikus%',    'seed'),
  ('asics',         'ASICS',             '%asics%',        'seed'),
  ('puma',          'Puma',              '%puma%',         'seed'),
  ('reebok',        'Reebok',            '%reebok%',       'seed'),
  ('fila',          'Fila',              '%fila %',        'seed'),
  ('new-balance',   'New Balance',       '%new balance%',  'seed'),
  ('saucony',       'Saucony',           '%saucony%',      'seed'),
  ('under-armour',  'Under Armour',      '%under armour%', 'seed'),
  ('converse',      'Converse',          '%converse%',     'seed'),
  ('vans',          'Vans',              '%vans%',         'seed'),
  -- Cosméticos
  ('avon',          'Avon',              '%avon%',         'seed'),
  ('natura',        'Natura',            '%natura %',      'seed'),
  ('boticario',     'O Boticário',       '%boticário%',    'seed'),
  ('maybelline',    'Maybelline',        '%maybelline%',   'seed'),
  ('loreal',        'L''Oréal',          '%l''oreal%',     'seed'),
  -- Tecnologia
  ('samsung',       'Samsung',           '%samsung%',      'seed'),
  ('apple',         'Apple',             '%apple%',        'seed'),
  ('lenovo',        'Lenovo',            '%lenovo%',       'seed'),
  ('asus',          'ASUS',              '%asus%',         'seed'),
  ('lg',            'LG',               '%lg %',          'seed'),
  -- Gaming
  ('razer',         'Razer',             '%razer%',        'seed'),
  ('corsair',       'Corsair',           '%corsair%',      'seed'),
  ('hyperx',        'HyperX',            '%hyperx%',       'seed'),
  ('logitech',      'Logitech',          '%logitech%',     'seed'),
  -- Suplementos
  ('vitafor',       'Vitafor',           '%vitafor%',      'seed'),
  ('growth',        'Growth Supplements','%growth%',       'seed'),
  ('max-titanium',  'Max Titanium',      '%max titanium%', 'seed')
ON CONFLICT DO NOTHING;

-- Função para classificar brand a partir do título
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

-- Backfill brand nos produtos existentes
UPDATE catalog SET brand = classify_catalog_brand(title)
WHERE brand IS NULL AND title IS NOT NULL;
