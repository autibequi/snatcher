-- =============================================================================
-- MIGRATION CONSOLIDADA — sessão 2026-05-14
-- Agrupa todas as migrations 20260524100000-20260524100012 em uma única
-- para aplicação em banco zerado. Idempotente (IF NOT EXISTS / ON CONFLICT).
-- =============================================================================

-- ── 1. Tunables de scoring ────────────────────────────────────────────────────
INSERT INTO tunable_parameters (scope_type, scope_id, param_name, current_value, default_value, min_value, max_value) VALUES
    ('global', NULL, 'score_weight_quality',              0.30, 0.30, 0.00, 1.00),
    ('global', NULL, 'score_weight_affinity',             0.20, 0.20, 0.00, 1.00),
    ('global', NULL, 'score_weight_channel',              0.15, 0.15, 0.00, 1.00),
    ('global', NULL, 'score_weight_ctr',                  0.15, 0.15, 0.00, 1.00),
    ('global', NULL, 'score_weight_epc',                  0.10, 0.10, 0.00, 1.00),
    ('global', NULL, 'score_weight_freshness',            0.05, 0.05, 0.00, 1.00),
    ('global', NULL, 'score_weight_saturation',           0.30, 0.30, 0.00, 1.00),
    ('global', NULL, 'use_epsilon_explore',               0,    0,    0,    1),
    ('global', NULL, 'use_thompson_sampling',             0,    0,    0,    1),
    -- Repromo bypass
    ('global', NULL, 'repromo_drop_threshold',            0.10, 0.10, 0.02, 0.50),
    ('global', NULL, 'repromo_cooldown_hours',            24,   24,   6,    168),
    ('global', NULL, 'antirepeat_window_days',            7,    7,    1,    30),
    ('global', NULL, 'antirepeat_window_days_price_up',   14,   14,   7,    60),
    -- Click reward + decay temporal
    ('global', NULL, 'click_reward_weight',               0.10, 0.10, 0.00, 1.00),
    ('global', NULL, 'learned_half_life_days',            7,    7,    1,    30),
    -- Cap anti-viralização
    ('global', NULL, 'click_cap_per_member',              3.0,  3.0,  0.5,  20.0)
ON CONFLICT DO NOTHING;

-- ── 2. ALTER group_sent_history — price_at_send ───────────────────────────────
ALTER TABLE group_sent_history
    ADD COLUMN IF NOT EXISTS price_at_send NUMERIC(12,2);

-- ── 3. bandit_arms (com 3 cursores — já consolidado com o ALTER de 100004) ────
CREATE TABLE IF NOT EXISTS bandit_arms (
    group_id           BIGINT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    category_id        BIGINT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    alpha              DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    beta               DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    cursor_conversions TIMESTAMPTZ NOT NULL DEFAULT now() - INTERVAL '24 hours',
    cursor_clicks      TIMESTAMPTZ NOT NULL DEFAULT now() - INTERVAL '24 hours',
    cursor_losses      TIMESTAMPTZ NOT NULL DEFAULT now() - INTERVAL '24 hours',
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (group_id, category_id)
);
CREATE INDEX IF NOT EXISTS idx_bandit_arms_group ON bandit_arms (group_id);

-- Warm-start via learned_weights (só se houver dados).
INSERT INTO bandit_arms (group_id, category_id, alpha, beta, cursor_conversions, cursor_clicks, cursor_losses)
SELECT group_id, category_id,
       GREATEST(1.0, COALESCE(avg_ctr, 0) * COALESCE(sum_samples, 0)),
       GREATEST(1.0, (1.0 - COALESCE(avg_ctr, 0)) * COALESCE(sum_samples, 0)),
       now() - INTERVAL '24 hours',
       now() - INTERVAL '24 hours',
       now() - INTERVAL '24 hours'
FROM (
    SELECT group_id, category_id,
           AVG(ctr_30d)::numeric  AS avg_ctr,
           SUM(samples_30d)::numeric AS sum_samples
    FROM learned_weights
    WHERE category_id IS NOT NULL
    GROUP BY group_id, category_id
) lw
ON CONFLICT (group_id, category_id) DO NOTHING;

-- ── 4. group_shortlinks ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS group_shortlinks (
    short_id   TEXT PRIMARY KEY,
    catalog_id BIGINT NOT NULL REFERENCES catalog(id) ON DELETE CASCADE,
    group_id   BIGINT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (catalog_id, group_id)
);
CREATE INDEX IF NOT EXISTS idx_group_shortlinks_catalog ON group_shortlinks(catalog_id);
CREATE INDEX IF NOT EXISTS idx_group_shortlinks_group   ON group_shortlinks(group_id);

CREATE OR REPLACE FUNCTION ensure_group_shortlink(p_catalog BIGINT, p_group BIGINT)
RETURNS TEXT AS $$
DECLARE v_short TEXT;
BEGIN
    SELECT short_id INTO v_short
    FROM group_shortlinks
    WHERE catalog_id = p_catalog AND group_id = p_group;
    IF v_short IS NOT NULL THEN RETURN v_short; END IF;
    FOR i IN 1..5 LOOP
        BEGIN
            -- Sem pgcrypto: 10 hex chars (equiv. 5 bytes), cf. migration 20260526200000
            v_short := substring(
                md5(random()::text || clock_timestamp()::text || random()::text || i::text || p_catalog::text || p_group::text)
                from 1 for 10
            );
            INSERT INTO group_shortlinks (short_id, catalog_id, group_id)
            VALUES (v_short, p_catalog, p_group);
            RETURN v_short;
        EXCEPTION WHEN unique_violation THEN
            SELECT short_id INTO v_short
            FROM group_shortlinks
            WHERE catalog_id = p_catalog AND group_id = p_group;
            IF v_short IS NOT NULL THEN RETURN v_short; END IF;
        END;
    END LOOP;
    RAISE EXCEPTION 'ensure_group_shortlink: colisões esgotadas para (%, %)', p_catalog, p_group;
END;
$$ LANGUAGE plpgsql;

-- ── 5. learned_weights_channel ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS learned_weights_channel (
    channel_id  BIGINT NOT NULL REFERENCES channels_v2(id) ON DELETE CASCADE,
    category_id BIGINT NOT NULL REFERENCES categories(id),
    source_id   TEXT   NOT NULL REFERENCES sources(id),
    ctr_30d     NUMERIC(5,4),
    epc_30d     NUMERIC(10,4),
    samples_30d INT,
    confidence  NUMERIC(3,2),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (channel_id, category_id, source_id)
);
CREATE INDEX IF NOT EXISTS idx_learned_weights_channel_lookup
    ON learned_weights_channel (channel_id, category_id, source_id);

-- ── 6. bandit_arms_channel ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bandit_arms_channel (
    channel_id         BIGINT NOT NULL REFERENCES channels_v2(id) ON DELETE CASCADE,
    category_id        BIGINT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    alpha              DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    beta               DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    cursor_conversions TIMESTAMPTZ NOT NULL DEFAULT now() - INTERVAL '24 hours',
    cursor_clicks      TIMESTAMPTZ NOT NULL DEFAULT now() - INTERVAL '24 hours',
    cursor_losses      TIMESTAMPTZ NOT NULL DEFAULT now() - INTERVAL '24 hours',
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (channel_id, category_id)
);
CREATE INDEX IF NOT EXISTS idx_bandit_arms_channel_lookup
    ON bandit_arms_channel (channel_id);

-- Warm-start a partir de learned_weights_channel se já houver dados.
INSERT INTO bandit_arms_channel (channel_id, category_id, alpha, beta,
                                  cursor_conversions, cursor_clicks, cursor_losses)
SELECT channel_id, category_id,
       GREATEST(1.0, COALESCE(ctr_30d, 0) * COALESCE(samples_30d, 0)),
       GREATEST(1.0, (1.0 - COALESCE(ctr_30d, 0)) * COALESCE(samples_30d, 0)),
       now() - INTERVAL '24 hours',
       now() - INTERVAL '24 hours',
       now() - INTERVAL '24 hours'
FROM learned_weights_channel
WHERE category_id IS NOT NULL
ON CONFLICT (channel_id, category_id) DO NOTHING;

-- ── 7. group_virality (view observacional) ────────────────────────────────────
CREATE OR REPLACE VIEW group_virality AS
WITH base AS (
    SELECT cl.group_id,
           COUNT(*)::numeric                    AS clicks_total,
           COUNT(DISTINCT cl.short_id)::numeric AS unique_links
    FROM clicks cl
    WHERE cl.clicked_at > now() - INTERVAL '30 days'
      AND cl.group_id IS NOT NULL
    GROUP BY cl.group_id
),
caps AS (
    SELECT b.group_id, b.clicks_total, b.unique_links,
           g.member_count,
           b.unique_links * GREATEST(g.member_count, 1)
               * COALESCE(get_param('click_cap_per_member','global',NULL), 3.0) AS expected_max
    FROM base b
    JOIN groups g ON g.id = b.group_id
)
SELECT group_id,
       clicks_total::bigint                                                AS clicks_total,
       unique_links::bigint                                                AS unique_links,
       member_count,
       expected_max::bigint                                                AS expected_max,
       GREATEST(clicks_total - expected_max, 0)::bigint                   AS clicks_excedentes,
       CASE WHEN clicks_total > 0
            THEN GREATEST(clicks_total - expected_max, 0) / clicks_total
            ELSE 0 END                                                     AS virality_ratio
FROM caps;

-- ── 8. algo_status (dashboard do Score Engine) ────────────────────────────────
CREATE TABLE IF NOT EXISTS algo_status (
    id               INT PRIMARY KEY DEFAULT 1,
    last_tick_at     TIMESTAMPTZ,
    last_error       TEXT,
    last_enqueued    INT,
    tick_duration_ms INT,
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT algo_status_single_row CHECK (id = 1)
);
INSERT INTO algo_status (id) VALUES (1) ON CONFLICT DO NOTHING;

-- ── 9. Auto-classificação de produtos por keywords do título ──────────────────
CREATE OR REPLACE FUNCTION classify_catalog_category(p_title TEXT, p_source TEXT DEFAULT '')
RETURNS BIGINT AS $$
DECLARE
    v_slug TEXT;
    v_id   BIGINT;
BEGIN
    v_slug := CASE
        WHEN p_title ILIKE ANY(ARRAY[
                '%gamer%','%gaming%','%console%','%playstation%','%xbox%',
                '%nintendo%','%joystick%','%geforce%','%rtx%','%gtx%',
                '%corsair%','%razer%','%hyperx%','%steelseries%','%headset gamer%'
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
                '%cafeteira%','%torradeira%','%chaleira%'
             ])
            THEN 'casa'
        WHEN p_title ILIKE ANY(ARRAY[
                '%vestido%','%calça%','%calca%','%camiseta%','%camisa%',
                '%sapato%','%tênis%','%tenis%','%bota%','%sandália%','%sandalia%',
                '%bolsa%','%brinco%','%colar%','%anel%','%relógio%','%relogio%',
                '%perfume%','%maquiagem%','%pincel%','%batom%','%base%','% máscara%',
                '%shampoo%','%condicionador%','%creme%','%hidratante%'
             ])
            THEN 'moda'
        ELSE 'geral'
    END;
    SELECT id INTO v_id FROM categories WHERE slug = v_slug;
    RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- Classifica produtos existentes sem category_id (bulk — ignora erros por FK).
UPDATE catalog
SET category_id = classify_catalog_category(title, source_id)
WHERE category_id IS NULL
  AND title IS NOT NULL;

-- Trigger: classifica novos produtos automaticamente.
CREATE OR REPLACE FUNCTION trg_catalog_auto_classify() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.category_id IS NULL THEN
        NEW.category_id := classify_catalog_category(NEW.title, NEW.source_id);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS catalog_auto_classify ON catalog;
CREATE TRIGGER catalog_auto_classify
    BEFORE INSERT OR UPDATE OF title, source_id ON catalog
    FOR EACH ROW EXECUTE FUNCTION trg_catalog_auto_classify();

-- ── 10. channels_v2 — filtros de preço e desconto ────────────────────────────
ALTER TABLE channels_v2
    ADD COLUMN IF NOT EXISTS price_min        NUMERIC(12,2),
    ADD COLUMN IF NOT EXISTS price_max        NUMERIC(12,2),
    ADD COLUMN IF NOT EXISTS min_discount_pct NUMERIC(5,2) NOT NULL DEFAULT 0;
