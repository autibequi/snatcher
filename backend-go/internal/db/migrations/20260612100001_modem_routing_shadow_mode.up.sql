-- Adiciona coluna shadow_mode em modem_routing para controlar o período de shadow seed de 72h.
-- Quando true, o dispatcher registra divergências sem alterar o resultado efetivo do envio.
-- Gate de cutover: shadow_mode deve ser false em >= 99% das rows antes de ativar dispatch_engine.
ALTER TABLE modem_routing
    ADD COLUMN IF NOT EXISTS shadow_mode BOOLEAN NOT NULL DEFAULT TRUE;

-- Índice parcial para facilitar a query de contagem de rows ainda em shadow (métricas).
CREATE INDEX IF NOT EXISTS idx_modem_routing_shadow
    ON modem_routing (modem_id)
    WHERE shadow_mode = TRUE;
