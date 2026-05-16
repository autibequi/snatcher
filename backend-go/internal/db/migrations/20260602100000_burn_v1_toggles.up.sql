-- Migration: Burn V1 toggles
-- Date: 2026-06-02
-- Purpose: Delete 5 fossil toggles + insert dispatch_engine (temporary flag for W1 cutover)

DELETE FROM tunable_parameters
WHERE param_name IN (
    'use_algo_tick',
    'use_epsilon_explore',
    'use_thompson_sampling',
    'use_send_queue',
    'catalog_source'
);

INSERT INTO tunable_parameters (scope_type, scope_id, param_name, current_value, default_value, min_value, max_value)
VALUES ('global', NULL, 'dispatch_engine', 0, 0, 0, 1)
ON CONFLICT (scope_type, scope_id, param_name) DO NOTHING;

-- NOTE: param_value=0 represents 'legacy'; 1 represents 'v2'
-- This is a temporary toggle, removed at end of W1 (invariant I2)
