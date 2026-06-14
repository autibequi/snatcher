-- =============================================================================
-- SEED — Sistema PromoJon pré-configurado
-- Cria categorias extras, canais, grupos e pesos para começar funcional.
-- Todos os grupos ficam com whatsapp_jid = NULL até importação real da conta.
-- =============================================================================

-- ── 1. Categorias adicionais ──────────────────────────────────────────────────
INSERT INTO categories (slug, display_name, weight) VALUES
    ('cafe',       'Café & Bebidas',   1.10),
    ('cosmetico',  'Cosméticos',       1.05),
    ('suplemento', 'Suplementos',      1.10),
    ('churras',    'Churrasqueiras',   1.00)
ON CONFLICT (slug) DO NOTHING;

-- Atualiza função de auto-classificação com as novas categorias.
CREATE OR REPLACE FUNCTION classify_catalog_category(p_title TEXT, p_source TEXT DEFAULT '')
RETURNS BIGINT AS $$
DECLARE
    v_slug TEXT;
    v_id   BIGINT;
BEGIN
    v_slug := CASE
        WHEN p_title ILIKE ANY(ARRAY[
                '%café%','%cafe%','%espresso%','%nespresso%','%dolce gusto%',
                '%cápsula%','%capsula%','%grão%','%grao%','%moído%','%moido%',
                '%coador%','%chemex%','%prensa%','%aeropress%','%orfeu%',
                '%três corações%','%tres coracoes%','%melitta%','%cafeteira%'
             ])
            THEN 'cafe'

        WHEN p_title ILIKE ANY(ARRAY[
                '%whey%','%proteína%','%proteina%','%creatina%','%bcaa%',
                '%pré-treino%','%pre-treino%','%suplemento%','%aminoácido%',
                '%aminoacido%','%glutamina%','%hipercalórico%','%hipercalorico%',
                '%max titanium%','%growth%','%integral medica%','%nutrify%'
             ])
            THEN 'suplemento'

        WHEN p_title ILIKE ANY(ARRAY[
                '%batom%','%base%','%blush%','%contorno%','%iluminador%',
                '%máscara de cílios%','%mascara de cilios%','%sombra%',
                '%perfume%','%colônia%','%colonia%','%shampoo%','%condicionador%',
                '%creme%','%hidratante%','%sérum%','%serum%','%esfoliante%',
                '%maquiagem%','%makeup%','%beauty%','%avon%','%natura%',
                '%o boticário%','%boticario%','%maybelline%','%mac %','%nyx%'
             ])
            THEN 'cosmetico'

        WHEN p_title ILIKE ANY(ARRAY[
                '%churrasqueira%','%churrasqueiro%','%parrilla%','%grelha%',
                '%espetinho%','%espeto%','%faca de churrasco%','%tramontina%',
                '%weber%','%carvão%','%carvao%','%acendedor%','%defumador%'
             ])
            THEN 'churras'

        WHEN p_title ILIKE ANY(ARRAY[
                '%gamer%','%gaming%','%console%','%playstation%','%xbox%',
                '%nintendo%','%joystick%','%controle%','%geforce%','%rtx%','%gtx%',
                '%corsair%','%razer%','%hyperx%','%steelseries%','%headset gamer%',
                '%cadeira gamer%','%mousepad%'
             ])
            THEN 'gaming'

        WHEN p_title ILIKE ANY(ARRAY[
                '%celular%','%smartphone%','%tablet%','%notebook%','%laptop%',
                '%monitor%','%teclado%','%mouse%','%headphone%','%fone de ouvido%',
                '%smartwatch%','%câmera%','%camera%','%impressora%','%processador%',
                '% ssd%','%pendrive%','%roteador%','%carregador%','%cabo usb%',
                '%samsung%','%motorola%','%xiaomi%','%apple%','%iphone%','%ipad%',
                '%lenovo%','%asus%','%dell%','% hp %','%positivo%','%multilaser%'
             ])
            THEN 'eletronico'

        WHEN p_title ILIKE ANY(ARRAY[
                '%sofá%','%sofa%','%poltrona%','%mesa%','%cama%','%travesseiro%',
                '%colchão%','%colchao%','%geladeira%','%fogão%','%fogao%',
                '%microondas%','%liquidificador%','%panela%','%frigideira%',
                '%ventilador%','%luminária%','%luminaria%','%toalha%',
                '%lençol%','%lencol%','%cortina%','%tapete%',
                '%torradeira%','%chaleira%','%utensílio%'
             ])
            THEN 'casa'

        WHEN p_title ILIKE ANY(ARRAY[
                '%vestido%','%calça%','%calca%','%camiseta%','%camisa%',
                '%sapato%','%tênis%','%tenis%','%bota%','%sandália%','%sandalia%',
                '%bolsa%','%brinco%','%colar%','%anel%','%relógio%','%relogio%',
                '%moda%','%jaqueta%','%jeans%','%shorts%','%saia%'
             ])
            THEN 'moda'

        ELSE NULL
    END;

    IF v_slug IS NULL THEN
        RETURN NULL;
    END IF;
    SELECT id INTO v_id FROM categories WHERE slug = v_slug;
    RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- Reclassifica produtos sem categoria (com função atualizada).
UPDATE catalog
SET category_id = classify_catalog_category(title, source_id)
WHERE category_id IS NULL AND title IS NOT NULL;

-- ── 2. Canais PromoJon ────────────────────────────────────────────────────────
-- Cada canal tem threshold, cap e filtros de preço ajustados para o nicho.
INSERT INTO channels_v2 (name, quality_threshold, daily_cap, active, price_min, price_max, min_discount_pct)
VALUES
    ('Tech',            0.40, 30, true,  20,   3000, 0),
    ('Gaming',          0.40, 25, true,  30,   1500, 5),
    ('Casa & Deco',     0.40, 25, true,  20,   800,  0),
    ('Churrasqueiras',  0.45, 20, true,  150,  3000, 0),
    ('Café Gourmet',    0.40, 20, true,  15,   120,  0),
    ('Cosméticos',      0.40, 30, true,  15,   300,  0),
    ('Moda',            0.40, 30, true,  20,   500,  0),
    ('Tênis & Esporte', 0.40, 25, true,  80,   800,  5),
    ('Suplementos',     0.40, 25, true,  30,   500,  0)
ON CONFLICT DO NOTHING;

-- ── 3. Category weights por canal ─────────────────────────────────────────────
-- Tech: eletrônico forte, gaming leve
INSERT INTO channel_category_weights (channel_id, category_id, weight)
SELECT ch.id, cat.id,
       CASE cat.slug
           WHEN 'eletronico' THEN 100
           WHEN 'gaming'     THEN 30
       END
FROM channels_v2 ch
JOIN categories cat ON cat.slug IN ('eletronico', 'gaming')
WHERE ch.name = 'Tech'
ON CONFLICT (channel_id, category_id) DO UPDATE SET weight = EXCLUDED.weight;

-- Gaming: gaming forte, eletrônico leve
INSERT INTO channel_category_weights (channel_id, category_id, weight)
SELECT ch.id, cat.id,
       CASE cat.slug
           WHEN 'gaming'     THEN 100
           WHEN 'eletronico' THEN 20
       END
FROM channels_v2 ch
JOIN categories cat ON cat.slug IN ('gaming', 'eletronico')
WHERE ch.name = 'Gaming'
ON CONFLICT (channel_id, category_id) DO UPDATE SET weight = EXCLUDED.weight;

-- Casa & Deco
INSERT INTO channel_category_weights (channel_id, category_id, weight)
SELECT ch.id, cat.id, 100
FROM channels_v2 ch
JOIN categories cat ON cat.slug = 'casa'
WHERE ch.name = 'Casa & Deco'
ON CONFLICT (channel_id, category_id) DO UPDATE SET weight = EXCLUDED.weight;

-- Churrasqueiras: sub-nicho de casa
INSERT INTO channel_category_weights (channel_id, category_id, weight)
SELECT ch.id, cat.id,
       CASE cat.slug
           WHEN 'churras' THEN 100
           WHEN 'casa'    THEN 30
       END
FROM channels_v2 ch
JOIN categories cat ON cat.slug IN ('churras', 'casa')
WHERE ch.name = 'Churrasqueiras'
ON CONFLICT (channel_id, category_id) DO UPDATE SET weight = EXCLUDED.weight;

-- Café Gourmet
INSERT INTO channel_category_weights (channel_id, category_id, weight)
SELECT ch.id, cat.id, 100
FROM channels_v2 ch
JOIN categories cat ON cat.slug = 'cafe'
WHERE ch.name = 'Café Gourmet'
ON CONFLICT (channel_id, category_id) DO UPDATE SET weight = EXCLUDED.weight;

-- Cosméticos
INSERT INTO channel_category_weights (channel_id, category_id, weight)
SELECT ch.id, cat.id,
       CASE cat.slug
           WHEN 'cosmetico' THEN 100
           WHEN 'moda'      THEN 20
       END
FROM channels_v2 ch
JOIN categories cat ON cat.slug IN ('cosmetico', 'moda')
WHERE ch.name = 'Cosméticos'
ON CONFLICT (channel_id, category_id) DO UPDATE SET weight = EXCLUDED.weight;

-- Moda
INSERT INTO channel_category_weights (channel_id, category_id, weight)
SELECT ch.id, cat.id, 100
FROM channels_v2 ch
JOIN categories cat ON cat.slug = 'moda'
WHERE ch.name = 'Moda'
ON CONFLICT (channel_id, category_id) DO UPDATE SET weight = EXCLUDED.weight;

-- Tênis & Esporte: moda (calçados) com faixa de preço restrita
INSERT INTO channel_category_weights (channel_id, category_id, weight)
SELECT ch.id, cat.id, 100
FROM channels_v2 ch
JOIN categories cat ON cat.slug = 'moda'
WHERE ch.name = 'Tênis & Esporte'
ON CONFLICT (channel_id, category_id) DO UPDATE SET weight = EXCLUDED.weight;

-- Suplementos
INSERT INTO channel_category_weights (channel_id, category_id, weight)
SELECT ch.id, cat.id, 100
FROM channels_v2 ch
JOIN categories cat ON cat.slug = 'suplemento'
WHERE ch.name = 'Suplementos'
ON CONFLICT (channel_id, category_id) DO UPDATE SET weight = EXCLUDED.weight;

-- ── 4. (REMOVIDO) Grupos PromoJon fantasma ────────────────────────────────────
-- Antes este seed criava 9 grupos PromoJon com jid = NULL (nunca conectados ao
-- WhatsApp real). Poluíam a lista e travavam o tick (sem conta/admin/jid → não
-- disparam). Removido em 2026-06-14: os canais/categorias/pesos acima já dão o
-- terreno funcional; o operador importa grupos REAIS da conta em /admin/senders.
-- A migration 20260614120000_remove_phantom_promojon_groups limpa os já existentes.
