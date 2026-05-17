-- Remove o índice composto de worker/heartbeat criado em 20260612100000.
DROP INDEX IF EXISTS idx_send_queue_worker_heartbeat;
