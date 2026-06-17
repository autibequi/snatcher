-- Guarda o ÚLTIMO relatório diário de métricas gerado (pelo cron à meia-noite ou
-- pelo botão manual do dashboard) pra exibir como referência na tela. Single-row
-- (id=1): cada geração faz upsert, então sempre reflete o relatório mais recente.
CREATE TABLE IF NOT EXISTS last_daily_report (
    id           INT PRIMARY KEY DEFAULT 1,
    report_text  TEXT NOT NULL,
    source       TEXT NOT NULL DEFAULT 'cron',   -- 'cron' | 'manual'
    sent         BOOLEAN NOT NULL DEFAULT false, -- houve notifier pra enviar ao grupo
    generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT last_daily_report_singleton CHECK (id = 1)
);
