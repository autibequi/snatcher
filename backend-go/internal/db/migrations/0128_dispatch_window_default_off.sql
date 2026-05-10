-- migrate:up
-- Janela de envio: opt-in — só restringe horários se o utilizador ligar explicitamente na UI.
ALTER TABLE appconfig ALTER COLUMN dispatch_send_window_enabled SET DEFAULT FALSE;

-- migrate:down
ALTER TABLE appconfig ALTER COLUMN dispatch_send_window_enabled SET DEFAULT TRUE;
