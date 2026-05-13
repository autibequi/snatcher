-- Scoring v2: 7 pesos da fórmula composta + flag de ativação
-- A fórmula é aplicada em internal/algo/select.go (ver plano em
-- /home/bardiel/.claude/plans/valiant-crunching-mist.md).

INSERT INTO tunable_parameters (scope_type, scope_id, param_name, current_value, default_value, min_value, max_value) VALUES
    ('global', NULL, 'score_weight_quality',     0.30, 0.30, 0.00, 1.00),
    ('global', NULL, 'score_weight_affinity',    0.20, 0.20, 0.00, 1.00),
    ('global', NULL, 'score_weight_channel',     0.15, 0.15, 0.00, 1.00),
    ('global', NULL, 'score_weight_ctr',         0.15, 0.15, 0.00, 1.00),
    ('global', NULL, 'score_weight_epc',         0.10, 0.10, 0.00, 1.00),
    ('global', NULL, 'score_weight_freshness',   0.05, 0.05, 0.00, 1.00),
    ('global', NULL, 'score_weight_saturation',  0.30, 0.30, 0.00, 1.00),
    -- Fase 2: epsilon-greedy explore (desligado por padrão; liga após validar Fase 1)
    ('global', NULL, 'use_epsilon_explore',      0,    0,    0,    1),
    -- Fase 3: Thompson Sampling (desligado por padrão; precisa de 30d de dados)
    ('global', NULL, 'use_thompson_sampling',    0,    0,    0,    1)
ON CONFLICT DO NOTHING;
