-- Adiciona coluna routing_key em send_queue para registrar a chave de afinidade de domínio
-- resolvida no momento do dispatch. Permite auditoria de qual critério de roteamento foi
-- usado em cada envio, e evita recalcular afinidade no reprocessamento de jobs reenfileirados.
ALTER TABLE send_queue
    ADD COLUMN IF NOT EXISTS routing_key TEXT;

-- Índice para facilitar agrupamento e auditoria por routing_key (métricas de divergência).
CREATE INDEX IF NOT EXISTS idx_send_queue_routing_key
    ON send_queue (routing_key)
    WHERE routing_key IS NOT NULL;
