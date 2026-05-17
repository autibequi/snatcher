-- Reverter seed de quarantine_threshold
-- Remove apenas se ainda tiver o valor default (não foi configurado manualmente)
DELETE FROM tunable_parameters
WHERE param_name = 'quarantine_threshold'
  AND scope_type = 'global'
  AND scope_id IS NULL
  AND current_value = 5
  AND default_value = 5;
