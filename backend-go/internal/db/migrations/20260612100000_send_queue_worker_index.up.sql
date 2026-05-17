-- Índice composto (worker_id, heartbeat_at) em send_queue para a query de reclaim.
-- Permite localizar jobs de um worker específico cujo heartbeat parou, sem full-scan.
-- Parcial: apenas rows em status 'sending', reduzindo tamanho do índice.
CREATE INDEX IF NOT EXISTS idx_send_queue_worker_heartbeat
    ON send_queue (worker_id, heartbeat_at)
    WHERE status = 'sending';
