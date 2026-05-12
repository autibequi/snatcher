-- Cria tabela llm_actions para auditoria de toda ação automatizada por LLM
CREATE TABLE IF NOT EXISTS llm_actions (
    id            BIGSERIAL PRIMARY KEY,
    loop_name     TEXT NOT NULL,          -- 'affinity_adjust', 'template_ab', ...
    action_type   TEXT NOT NULL,          -- 'applied', 'suggested', 'rolled_back'
    target_table  TEXT NOT NULL,
    target_id     BIGINT,
    before_value  JSONB,
    after_value   JSONB,
    reasoning     TEXT,                   -- LLM justificativa
    confidence    NUMERIC(3,2),
    metrics_before JSONB,
    metrics_after  JSONB,                 -- preenchido N dias depois
    evaluation    TEXT,                   -- 'success' | 'rollback' | 'pending'
    applied_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    evaluated_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_llm_actions_loop
    ON llm_actions (loop_name, applied_at DESC);
