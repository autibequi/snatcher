-- Cria tabela tunable_parameters, função get_param() e seeds globais + flags strangler
CREATE TABLE IF NOT EXISTS tunable_parameters (
    id            BIGSERIAL PRIMARY KEY,
    scope_type    TEXT NOT NULL,     -- 'group' | 'modem' | 'category' | 'global'
    scope_id      BIGINT,            -- NULL se global
    param_name    TEXT NOT NULL,
    current_value NUMERIC NOT NULL,
    default_value NUMERIC NOT NULL,
    min_value     NUMERIC NOT NULL,
    max_value     NUMERIC NOT NULL,
    last_changed  TIMESTAMPTZ,
    last_change_by TEXT,             -- 'manual' | 'l8_tuning'
    UNIQUE (scope_type, scope_id, param_name)
);

CREATE INDEX IF NOT EXISTS idx_tunable_lookup
    ON tunable_parameters (param_name, scope_type, scope_id);

-- Função helper: pega valor com fallback pro global
CREATE OR REPLACE FUNCTION get_param(
    p_name     TEXT,
    p_scope    TEXT,
    p_scope_id BIGINT
) RETURNS NUMERIC AS $$
DECLARE v NUMERIC;
BEGIN
    -- 1. tenta scope específico
    SELECT current_value INTO v FROM tunable_parameters
    WHERE param_name = p_name AND scope_type = p_scope AND scope_id = p_scope_id;
    IF v IS NOT NULL THEN RETURN v; END IF;

    -- 2. fallback pro global
    SELECT current_value INTO v FROM tunable_parameters
    WHERE param_name = p_name AND scope_type = 'global' AND scope_id IS NULL;
    RETURN v;
END;
$$ LANGUAGE plpgsql;

-- Seeds globais: parâmetros que estavam hardcoded no Algo
INSERT INTO tunable_parameters (scope_type, scope_id, param_name, current_value, default_value, min_value, max_value) VALUES
    ('global', NULL, 'quality_threshold',      0.40,     0.40,     0.20,   0.70),
    ('global', NULL, 'baseline_min',           8,        8,        3,      20),
    ('global', NULL, 'cap_max',                30,       30,       10,     60),
    ('global', NULL, 'cooldown_seconds',       90,       90,       45,     240),
    ('global', NULL, 'half_life_freshness',    7,        7,        2,      30),
    ('global', NULL, 'half_life_learned',      7,        7,        2,      30),
    ('global', NULL, 'anti_saturation_decay',  0.60,     0.60,     0.20,   0.95),
    ('global', NULL, 'diversity_bonus_weight', 0.30,     0.30,     0.00,   0.80),
    ('global', NULL, 'epsilon_base',           0.40,     0.40,     0.05,   0.60),
    ('global', NULL, 'epsilon_decay_rate',     0.00035,  0.00035,  0.0001, 0.001)
ON CONFLICT DO NOTHING;

-- Flags strangler (0=legacy, 1=canonical) — controla migração gradual de features
INSERT INTO tunable_parameters (scope_type, scope_id, param_name, current_value, default_value, min_value, max_value) VALUES
    ('global', NULL, 'use_algo_tick',    0, 0, 0, 1),
    ('global', NULL, 'use_send_queue',   0, 0, 0, 1),
    ('global', NULL, 'catalog_source',   0, 0, 0, 1)
ON CONFLICT DO NOTHING;
