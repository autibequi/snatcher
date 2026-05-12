-- Cria tabela system_pauses para registro de pausas sistêmicas (manuais ou por LLM loop)
CREATE TABLE IF NOT EXISTS system_pauses (
    id                 BIGSERIAL PRIMARY KEY,
    triggered_by       TEXT NOT NULL,     -- 'llm_loop_6' | 'manual' | 'human_via_dashboard'
    reasoning          TEXT,
    signals_snapshot   JSONB,
    paused_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    resumed_at         TIMESTAMPTZ,
    was_false_positive BOOLEAN
);
