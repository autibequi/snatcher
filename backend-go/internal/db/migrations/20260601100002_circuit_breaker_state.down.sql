-- Drop trigger first (must happen before function)
DROP TRIGGER IF EXISTS trg_touch_circuit_breaker_state ON circuit_breaker_state;

-- Drop trigger function
DROP FUNCTION IF EXISTS touch_circuit_breaker_state();

-- Drop table
DROP TABLE IF EXISTS circuit_breaker_state;

-- Drop enum type
DROP TYPE IF EXISTS circuit_breaker_state_t;
