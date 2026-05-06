-- Migration 0091: Add consecutive_failures and inactive columns to catalogproduct
-- (Increment/Reset operam sobre IDs de catalogproduct — tabela canônica do catálogo)
ALTER TABLE catalogproduct ADD COLUMN IF NOT EXISTS consecutive_failures INT NOT NULL DEFAULT 0;
ALTER TABLE catalogproduct ADD COLUMN IF NOT EXISTS inactive BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS ix_catalogproduct_inactive ON catalogproduct(inactive) WHERE inactive = FALSE;
