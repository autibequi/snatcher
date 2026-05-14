-- send_log.catalog_id nullable: disparos manuais (message_override) não têm produto associado
ALTER TABLE send_log ALTER COLUMN catalog_id DROP NOT NULL;

-- quarantine_threshold: número de falhas consecutivas antes de quarentenar uma conta (default 5)
INSERT INTO tunable_parameters (scope_type, scope_id, param_name, current_value, default_value, min_value, max_value)
VALUES ('global', NULL, 'quarantine_threshold', 5, 5, 1, 20)
ON CONFLICT DO NOTHING;
