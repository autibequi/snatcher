-- Expandir constraint composed_by para incluir novos valores
ALTER TABLE dispatches DROP CONSTRAINT IF EXISTS dispatches_composed_by_check;
ALTER TABLE dispatches ADD CONSTRAINT dispatches_composed_by_check
    CHECK (composed_by IN ('manual', 'auto', 'auto-match', 'api'));
