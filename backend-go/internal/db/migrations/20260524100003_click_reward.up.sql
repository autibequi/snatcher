-- Tunables para fechar o loop click → scoring em tempo quase real:
-- A) Thompson Sampling passa a contar clicks (não só conversões) como recompensa.
-- B) refresh_learned_weights agrega com decay exponencial dentro da janela de 30d
--    para dar mais peso a sinais recentes.

INSERT INTO tunable_parameters (scope_type, scope_id, param_name, current_value, default_value, min_value, max_value) VALUES
    -- Peso da recompensa por click no Thompson: alpha += click_reward_weight por click
    -- (conversão sempre +1.0). 0.10 = 10 clicks valem 1 conversão.
    ('global', NULL, 'click_reward_weight',     0.10, 0.10, 0.00, 1.00),
    -- Meia-vida do decay temporal dentro da janela de 30d para CTR/EPC
    -- (clicks de 7d atrás pesam metade dos de hoje quando =7).
    ('global', NULL, 'learned_half_life_days',  7,    7,    1,    30)
ON CONFLICT DO NOTHING;
