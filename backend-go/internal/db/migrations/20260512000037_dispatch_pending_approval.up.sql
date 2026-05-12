-- Adiciona status 'pending_approval' para o fluxo man-in-the-middle
ALTER TABLE dispatches DROP CONSTRAINT IF EXISTS dispatches_status_check;
ALTER TABLE dispatches ADD CONSTRAINT dispatches_status_check
    CHECK (status IN ('draft', 'queued', 'sending', 'completed', 'failed', 'pending_approval'));
