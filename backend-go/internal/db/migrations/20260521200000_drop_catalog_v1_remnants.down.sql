-- Restaura catalog_source se necessário reverter
INSERT INTO tunable_parameters (scope_type, scope_id, param_name, current_value, default_value, min_value, max_value)
VALUES ('global', NULL, 'catalog_source', 0, 0, 0, 1)
ON CONFLICT DO NOTHING;
