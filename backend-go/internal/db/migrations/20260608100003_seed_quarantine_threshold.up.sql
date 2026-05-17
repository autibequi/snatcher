-- W3: Seed quarantine_threshold em tunable_parameters
--
-- O seed principal já foi inserido em 20260524200002_send_log_nullable_catalog.up.sql:
--   INSERT INTO tunable_parameters (scope_type, scope_id, param_name, current_value, default_value, min_value, max_value)
--   VALUES ('global', NULL, 'quarantine_threshold', 5, 5, 1, 20)
--   ON CONFLICT DO NOTHING;
--
-- Esta migration garante idempotência: se o banco foi criado sem a migration anterior
-- (ex: ambiente de teste isolado), o param ainda será inserido.
INSERT INTO tunable_parameters (scope_type, scope_id, param_name, current_value, default_value, min_value, max_value)
VALUES ('global', NULL, 'quarantine_threshold', 5, 5, 1, 20)
ON CONFLICT DO NOTHING;

-- Referência de uso: smoke test manual para quarantine_events
-- (comentado — não executar em produção; usar apenas para validação local do schema)
--
-- INSERT INTO quarantine_events (subject_kind, subject_id, reason, quarantine_until, payload)
-- VALUES (
--     'account',
--     1,
--     'consecutive_failures>=5',
--     now() + interval '24 hours',
--     '{"consecutive_failures": 5, "quarantine_threshold": 5, "smoke_test": true}'::jsonb
-- );
