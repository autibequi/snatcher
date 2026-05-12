-- Cria tabela llm_suggestions para sugestões pendentes no dashboard de aprovação
CREATE TABLE IF NOT EXISTS llm_suggestions (
    id              BIGSERIAL PRIMARY KEY,
    loop_name       TEXT NOT NULL,
    target_type     TEXT NOT NULL,
    target_id       BIGINT NOT NULL,
    suggestion      TEXT NOT NULL,
    proposed_change JSONB NOT NULL,
    reasoning       TEXT,
    confidence      NUMERIC(3,2),
    status          TEXT NOT NULL DEFAULT 'pending',
    dismissed_reason TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    acted_at        TIMESTAMPTZ,
    expires_at      TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '7 days'
);

CREATE INDEX IF NOT EXISTS idx_llm_suggestions_pending
    ON llm_suggestions (loop_name, created_at DESC)
    WHERE status = 'pending';
