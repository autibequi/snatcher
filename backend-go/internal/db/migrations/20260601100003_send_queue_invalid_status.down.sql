-- Reverte a adição do status 'invalid' e coluna last_error da send_queue.

ALTER TABLE send_queue
    DROP CONSTRAINT IF EXISTS send_queue_status_check;

ALTER TABLE send_queue
    DROP COLUMN IF EXISTS last_error;
