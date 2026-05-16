ALTER TABLE send_queue ADD COLUMN lease_expires_at TIMESTAMPTZ;
ALTER TABLE send_queue ADD COLUMN worker_id TEXT;
ALTER TABLE send_queue ADD COLUMN heartbeat_at TIMESTAMPTZ;
ALTER TABLE send_queue ADD COLUMN score NUMERIC DEFAULT 0;
ALTER TABLE send_queue ADD COLUMN scheduled_for TIMESTAMPTZ;
CREATE INDEX idx_send_queue_lease ON send_queue(lease_expires_at) WHERE status = 'sending';
