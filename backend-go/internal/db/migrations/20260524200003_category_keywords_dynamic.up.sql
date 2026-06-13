-- Tabela de keywords por categoria — manipulável pelo Jonfrey, LLM e admin.
-- Substitui keywords hardcoded na função classify_catalog_category.
CREATE TABLE IF NOT EXISTS category_keywords (
    id           BIGSERIAL PRIMARY KEY,
    category_slug TEXT NOT NULL REFERENCES categories(slug) ON DELETE CASCADE,
    pattern      TEXT NOT NULL,   -- formato ILIKE: %palavra%
    active       BOOLEAN NOT NULL DEFAULT true,
    source       TEXT NOT NULL DEFAULT 'seed',  -- 'seed' | 'llm' | 'manual'
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (category_slug, pattern)
);
CREATE INDEX idx_category_keywords_slug ON category_keywords(category_slug) WHERE active = true;

-- Garante a categoria 'tenis' antes do seed de keywords. Ela faltava no seed de categories
-- (create_categories só tem 8 slugs), então a FK category_keywords_category_slug_fkey
-- quebrava o boot num banco fresh ao inserir as keywords de 'tenis'. Idempotente.
INSERT INTO categories (slug, display_name, weight) VALUES ('tenis', 'Tênis & Esporte', 1.0)
ON CONFLICT (slug) DO NOTHING;

-- Seed inicial de keywords (pode ser editado via painel ou Jonfrey)
INSERT INTO category_keywords (category_slug, pattern, source) VALUES
  -- Café
  ('cafe', '%café%', 'seed'), ('cafe', '%cafe%', 'seed'), ('cafe', '%espresso%', 'seed'),
  ('cafe', '%nespresso%', 'seed'), ('cafe', '%dolce gusto%', 'seed'),
  ('cafe', '%cápsula%', 'seed'), ('cafe', '%capsula%', 'seed'),
  ('cafe', '%grão%', 'seed'), ('cafe', '%grao%', 'seed'),
  ('cafe', '%coador%', 'seed'), ('cafe', '%chemex%', 'seed'), ('cafe', '%aeropress%', 'seed'),
  ('cafe', '%três corações%', 'seed'), ('cafe', '%melitta%', 'seed'),
  -- Tênis & Esporte
  ('tenis', '%tênis%', 'seed'), ('tenis', '%tenis%', 'seed'),
  ('tenis', '%calçado%', 'seed'), ('tenis', '%sapato%', 'seed'),
  ('tenis', '%running%', 'seed'), ('tenis', '%sneaker%', 'seed'),
  ('tenis', '%chuteira%', 'seed'), ('tenis', '%sapatilha%', 'seed'),
  ('tenis', '%bota esport%', 'seed'), ('tenis', '%esportivo%', 'seed'),
  ('tenis', '%mizuno%', 'seed'), ('tenis', '%olympikus%', 'seed'),
  ('tenis', '%asics%', 'seed'), ('tenis', '%soulsfeng%', 'seed'),
  ('tenis', '%salming%', 'seed'), ('tenis', '%saucony%', 'seed'),
  -- Suplementos
  ('suplemento', '%whey%', 'seed'), ('suplemento', '%proteína%', 'seed'),
  ('suplemento', '%proteina%', 'seed'), ('suplemento', '%creatina%', 'seed'),
  ('suplemento', '%bcaa%', 'seed'), ('suplemento', '%pré-treino%', 'seed'),
  ('suplemento', '%suplemento%', 'seed'), ('suplemento', '%glutamina%', 'seed'),
  ('suplemento', '%hipercalórico%', 'seed'), ('suplemento', '%vitafor%', 'seed'),
  -- Cosméticos
  ('cosmetico', '%batom%', 'seed'), ('cosmetico', '%blush%', 'seed'),
  ('cosmetico', '%sombra%', 'seed'), ('cosmetico', '%hidratante%', 'seed'),
  ('cosmetico', '%sérum%', 'seed'), ('cosmetico', '%serum%', 'seed'),
  ('cosmetico', '%protetor solar%', 'seed'), ('cosmetico', '%perfume%', 'seed'),
  ('cosmetico', '%colônia%', 'seed'), ('cosmetico', '%shampoo%', 'seed'),
  ('cosmetico', '%condicionador%', 'seed'), ('cosmetico', '%maquiagem%', 'seed'),
  ('cosmetico', '%makeup%', 'seed'), ('cosmetico', '%esfoliante%', 'seed'),
  -- Churrasqueiras
  ('churras', '%churrasqueira%', 'seed'), ('churras', '%churrasqueiro%', 'seed'),
  ('churras', '%parrilla%', 'seed'), ('churras', '%grelha%', 'seed'),
  ('churras', '%espeto%', 'seed'), ('churras', '%carvão%', 'seed'),
  ('churras', '%carvao%', 'seed'), ('churras', '%acendedor%', 'seed'),
  ('churras', '%defumador%', 'seed'), ('churras', '%faca de churrasco%', 'seed'),
  -- Gaming
  ('gaming', '%gamer%', 'seed'), ('gaming', '%gaming%', 'seed'),
  ('gaming', '%joystick%', 'seed'), ('gaming', '%controle%', 'seed'),
  ('gaming', '%console%', 'seed'), ('gaming', '%playstation%', 'seed'),
  ('gaming', '%xbox%', 'seed'), ('gaming', '%nintendo%', 'seed'),
  ('gaming', '%geforce%', 'seed'), ('gaming', '%rtx%', 'seed'),
  ('gaming', '%headset gamer%', 'seed'), ('gaming', '%mousepad%', 'seed'),
  -- Moda
  ('moda', '%camiseta%', 'seed'), ('moda', '%vestido%', 'seed'),
  ('moda', '%calça%', 'seed'), ('moda', '%blusa%', 'seed'),
  ('moda', '%jaqueta%', 'seed'), ('moda', '%casaco%', 'seed'),
  ('moda', '%bermuda%', 'seed'), ('moda', '%meia%', 'seed'),
  ('moda', '%roupa%', 'seed'), ('moda', '%moletom%', 'seed'),
  -- Casa
  ('casa', '%aspirador%', 'seed'), ('casa', '%liquidificador%', 'seed'),
  ('casa', '%micro-ondas%', 'seed'), ('casa', '%panela%', 'seed'),
  ('casa', '%frigideira%', 'seed'), ('casa', '%torradeira%', 'seed'),
  ('casa', '%organizador%', 'seed'), ('casa', '%cortina%', 'seed'),
  ('casa', '%tapete%', 'seed'), ('casa', '%ventilador%', 'seed'),
  ('casa', '%colchão%', 'seed'), ('casa', '%travesseiro%', 'seed'),
  -- Eletrônicos
  ('eletronico', '%smartphone%', 'seed'), ('eletronico', '%celular%', 'seed'),
  ('eletronico', '%notebook%', 'seed'), ('eletronico', '%monitor%', 'seed'),
  ('eletronico', '%tablet%', 'seed'), ('eletronico', '%ssd%', 'seed'),
  ('eletronico', '%fone%', 'seed'), ('eletronico', '%headphone%', 'seed'),
  ('eletronico', '%earphone%', 'seed'), ('eletronico', '%smartwatch%', 'seed'),
  ('eletronico', '%impressora%', 'seed'), ('eletronico', '%roteador%', 'seed')
ON CONFLICT DO NOTHING;

-- Atualiza classify_catalog_category para ler da tabela (sem hardcode)
CREATE OR REPLACE FUNCTION classify_catalog_category(p_title TEXT, p_source TEXT DEFAULT '')
RETURNS BIGINT AS $$
DECLARE
    v_slug TEXT;
    v_id   BIGINT;
BEGIN
    SELECT ck.category_slug INTO v_slug
    FROM category_keywords ck
    WHERE ck.active = true
      AND LOWER(p_title) ILIKE ck.pattern
    ORDER BY ck.id
    LIMIT 1;

    IF v_slug IS NULL THEN
        RETURN NULL;
    END IF;

    SELECT id INTO v_id FROM categories WHERE slug = v_slug;
    RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- Reclassifica produtos existentes usando a nova função
UPDATE catalog
SET category_id = classify_catalog_category(title, source_id)
WHERE category_id IS NULL;
