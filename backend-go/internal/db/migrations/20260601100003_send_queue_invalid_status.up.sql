-- Adiciona suporte ao status 'invalid' na send_queue.
-- Usado quando um item é rejeitado por desconto inválido (price_original NULL ou <= price_current)
-- e não deve ser re-tentado nem penalizar a conta.
--
-- Também adiciona coluna last_error para registrar o motivo da rejeição.

ALTER TABLE send_queue
    ADD COLUMN IF NOT EXISTS last_error TEXT;

-- Adiciona CHECK constraint para documentar os valores válidos de status.
-- A tabela original não tinha constraint (TEXT puro) — este ALTER é aditivo e retrocompatível.
ALTER TABLE send_queue
    DROP CONSTRAINT IF EXISTS send_queue_status_check;

ALTER TABLE send_queue
    ADD CONSTRAINT send_queue_status_check
        CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'invalid'));
