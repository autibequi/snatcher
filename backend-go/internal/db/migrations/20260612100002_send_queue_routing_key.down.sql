-- Remove o índice e coluna routing_key criados em 20260612100002.
DROP INDEX IF EXISTS idx_send_queue_routing_key;
ALTER TABLE send_queue DROP COLUMN IF EXISTS routing_key;
