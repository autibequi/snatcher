-- migrate:up
-- Janela de envio dos disparos (WhatsApp/Evolution): timezone + toggle explícito.
ALTER TABLE appconfig ADD COLUMN IF NOT EXISTS dispatch_send_window_enabled BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE appconfig ADD COLUMN IF NOT EXISTS dispatch_send_timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo';

-- migrate:down
ALTER TABLE appconfig DROP COLUMN IF EXISTS dispatch_send_timezone;
ALTER TABLE appconfig DROP COLUMN IF EXISTS dispatch_send_window_enabled;
