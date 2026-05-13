-- Fix #2: cursor único processed_up_to causava double-count.
-- Cada UPDATE movia o cursor pra now-24h, mas as 3 queries (conversions/clicks/losses)
-- são reprocessadas a cada tick (5min); eventos das últimas 24h eram contados ~144x.
--
-- Solução: 3 cursores independentes, avançados pelo MAX(event.timestamp) processado.
-- Conversions e clicks: cursor avança até o último evento incluído.
-- Losses: cursor é now() - INTERVAL '24 hours' (mantém maturidade do envio).

ALTER TABLE bandit_arms
    ADD COLUMN IF NOT EXISTS cursor_conversions TIMESTAMPTZ NOT NULL DEFAULT now() - INTERVAL '24 hours',
    ADD COLUMN IF NOT EXISTS cursor_clicks      TIMESTAMPTZ NOT NULL DEFAULT now() - INTERVAL '24 hours',
    ADD COLUMN IF NOT EXISTS cursor_losses      TIMESTAMPTZ NOT NULL DEFAULT now() - INTERVAL '24 hours';

-- Migra o cursor antigo (se existir) pros 3 novos.
UPDATE bandit_arms
SET cursor_conversions = processed_up_to,
    cursor_clicks      = processed_up_to,
    cursor_losses      = processed_up_to
WHERE processed_up_to IS NOT NULL;

ALTER TABLE bandit_arms DROP COLUMN IF EXISTS processed_up_to;
