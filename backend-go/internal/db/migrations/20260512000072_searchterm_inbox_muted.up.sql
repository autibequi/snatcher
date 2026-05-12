-- Silencia alertas do inbox do dashboard para um crawler sem desativá-lo (Auto disparos / operação).
ALTER TABLE searchterm ADD COLUMN IF NOT EXISTS inbox_muted BOOLEAN NOT NULL DEFAULT false;
