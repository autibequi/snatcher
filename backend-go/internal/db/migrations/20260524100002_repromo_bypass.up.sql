-- Bypass de re-envio quando promo melhora significativamente após envio anterior.
-- Substitui o filtro hard de 7d em select.go por lógica condicional:
--
--   permite re-enviar se: last_price_drop_at > last_sent_at + cooldown
--                     AND (price_at_send - price_current) / price_at_send >= threshold
--
-- Caso contrário mantém o bloqueio de 7d.

ALTER TABLE group_sent_history
    ADD COLUMN IF NOT EXISTS price_at_send NUMERIC(12,2);

INSERT INTO tunable_parameters (scope_type, scope_id, param_name, current_value, default_value, min_value, max_value) VALUES
    -- Queda mínima vs preço do último envio para reativar (0.10 = 10%)
    ('global', NULL, 'repromo_drop_threshold',  0.10, 0.10, 0.02, 0.50),
    -- Mínimo de horas entre dois envios do mesmo dedup_key mesmo com bypass
    ('global', NULL, 'repromo_cooldown_hours',  24,   24,   6,    168),
    -- Janela padrão de anti-repeat quando não há bypass (em dias)
    ('global', NULL, 'antirepeat_window_days',  7,    7,    1,    30),
    -- Skip estendido se preço SUBIU após envio (produto piorou — não vale repostar)
    ('global', NULL, 'antirepeat_window_days_price_up', 14, 14, 7, 60)
ON CONFLICT DO NOTHING;
