-- Rollback: Burn V1 toggles
-- Reverts dispatch_engine and restores 5 fossil toggles

DELETE FROM tunable_parameters WHERE param_name = 'dispatch_engine';

INSERT INTO tunable_parameters (scope_type, scope_id, param_name, current_value, default_value, min_value, max_value) VALUES
    ('global', NULL, 'use_algo_tick', 0, 0, 0, 1),
    ('global', NULL, 'use_epsilon_explore', 0, 0, 0, 1),
    ('global', NULL, 'use_thompson_sampling', 0, 0, 0, 1),
    ('global', NULL, 'use_send_queue', 0, 0, 0, 1),
    ('global', NULL, 'catalog_source', 0, 0, 0, 1)
ON CONFLICT (scope_type, scope_id, param_name) DO NOTHING;
