DROP INDEX IF EXISTS idx_send_queue_lease;
ALTER TABLE send_queue DROP COLUMN IF EXISTS scheduled_for;
ALTER TABLE send_queue DROP COLUMN IF EXISTS score;
ALTER TABLE send_queue DROP COLUMN IF EXISTS heartbeat_at;
ALTER TABLE send_queue DROP COLUMN IF EXISTS worker_id;
ALTER TABLE send_queue DROP COLUMN IF EXISTS lease_expires_at;
