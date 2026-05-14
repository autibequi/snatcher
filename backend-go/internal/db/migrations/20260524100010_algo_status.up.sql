-- Registro do último tick do Score Engine — 1 linha (upsert).
-- Lido pelo dashboard para exibir status em tempo real.
CREATE TABLE IF NOT EXISTS algo_status (
    id           INT PRIMARY KEY DEFAULT 1,
    last_tick_at TIMESTAMPTZ,
    last_error   TEXT,            -- NULL = último tick ok
    last_enqueued INT,            -- grupos enfileirados no último tick
    tick_duration_ms INT,
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT algo_status_single_row CHECK (id = 1)
);
INSERT INTO algo_status (id) VALUES (1) ON CONFLICT DO NOTHING;
