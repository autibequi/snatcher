-- Create circuit_breaker_state_t enum
CREATE TYPE circuit_breaker_state_t AS ENUM ('closed', 'open', 'half_open');

-- Create circuit_breaker_state table
CREATE TABLE circuit_breaker_state (
    upstream             TEXT PRIMARY KEY,
    state                circuit_breaker_state_t NOT NULL DEFAULT 'closed',
    opened_at            TIMESTAMPTZ,
    half_open_probe_at   TIMESTAMPTZ,
    failure_count        INT NOT NULL DEFAULT 0,
    last_failure_at      TIMESTAMPTZ,
    last_success_at      TIMESTAMPTZ,
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create trigger function for updated_at timestamp
CREATE OR REPLACE FUNCTION touch_circuit_breaker_state() RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on circuit_breaker_state table
CREATE TRIGGER trg_touch_circuit_breaker_state
    BEFORE UPDATE ON circuit_breaker_state
    FOR EACH ROW EXECUTE FUNCTION touch_circuit_breaker_state();

-- Seed initial upstreams (Evolution API and LLM providers)
INSERT INTO circuit_breaker_state (upstream) VALUES
    ('evolution_api'),
    ('llm_anthropic'),
    ('llm_openai'),
    ('llm_ollama')
ON CONFLICT (upstream) DO NOTHING;
