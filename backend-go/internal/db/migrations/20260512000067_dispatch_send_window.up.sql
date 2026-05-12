-- Janela de envio dos disparos (WhatsApp/Evolution): timezone + toggle explícito.
ALTER TABLE appconfig ADD COLUMN IF NOT EXISTS dispatch_send_window_enabled BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE appconfig ADD COLUMN IF NOT EXISTS dispatch_send_timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo';
