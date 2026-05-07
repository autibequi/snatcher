-- migrate:up
-- Marca produtos auditados por LLM/inspeção e armazena resumo da auditoria
ALTER TABLE catalogproduct ADD COLUMN IF NOT EXISTS inspected BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE catalogproduct ADD COLUMN IF NOT EXISTS inspected_at TIMESTAMPTZ;
ALTER TABLE catalogproduct ADD COLUMN IF NOT EXISTS inspection_notes TEXT;

CREATE INDEX IF NOT EXISTS idx_catalogproduct_not_inspected
  ON catalogproduct(inspected) WHERE inspected = false;

-- migrate:down
ALTER TABLE catalogproduct DROP COLUMN IF EXISTS inspected;
ALTER TABLE catalogproduct DROP COLUMN IF EXISTS inspected_at;
ALTER TABLE catalogproduct DROP COLUMN IF EXISTS inspection_notes;
