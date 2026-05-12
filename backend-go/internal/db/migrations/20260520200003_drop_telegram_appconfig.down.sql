-- Rollback F10/F12 drop telegram — recria colunas com defaults do schema inicial
-- (20260512000001_initial.up.sql). Dados perdidos são irrecuperáveis após o up.

BEGIN;

ALTER TABLE appconfig
    ADD COLUMN IF NOT EXISTS tg_enabled BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS tg_bot_token TEXT,
    ADD COLUMN IF NOT EXISTS tg_bot_username TEXT,
    ADD COLUMN IF NOT EXISTS tg_group_prefix TEXT DEFAULT 'Snatcher',
    ADD COLUMN IF NOT EXISTS tg_last_update_id INT;

COMMIT;
