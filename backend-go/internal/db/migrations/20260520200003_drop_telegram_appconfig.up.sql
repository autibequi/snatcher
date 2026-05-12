-- F10/F12: Drop colunas Telegram da appconfig — Telegram descontinuado em F06.
-- Struct AppConfig já não declara campos TG_* desde F06 (internal/models/models.go).
-- Esta migration alinha o schema com o struct, eliminando o sqlx scan error
-- "missing destination name tg_enabled in *models.AppConfig" em GET /api/config.

BEGIN;

ALTER TABLE appconfig
    DROP COLUMN IF EXISTS tg_enabled,
    DROP COLUMN IF EXISTS tg_bot_token,
    DROP COLUMN IF EXISTS tg_bot_username,
    DROP COLUMN IF EXISTS tg_group_prefix,
    DROP COLUMN IF EXISTS tg_last_update_id;

COMMIT;
