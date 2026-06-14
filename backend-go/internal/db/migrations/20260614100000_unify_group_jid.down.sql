-- Recria a coluna whatsapp_jid e copia de volta a partir de jid.
ALTER TABLE groups ADD COLUMN IF NOT EXISTS whatsapp_jid TEXT;
UPDATE groups SET whatsapp_jid = jid WHERE jid IS NOT NULL;
