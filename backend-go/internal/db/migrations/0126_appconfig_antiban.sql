-- Limites anti-ban globais (antes só existiam no front; PUT /api/config ignorava as chaves).

ALTER TABLE appconfig ADD COLUMN IF NOT EXISTS interval_between_groups_sec INT NOT NULL DEFAULT 5;
ALTER TABLE appconfig ADD COLUMN IF NOT EXISTS interval_between_channels_sec INT NOT NULL DEFAULT 30;
ALTER TABLE appconfig ADD COLUMN IF NOT EXISTS daily_limit_per_account INT NOT NULL DEFAULT 200;
ALTER TABLE appconfig ADD COLUMN IF NOT EXISTS rotate_accounts BOOLEAN NOT NULL DEFAULT FALSE;
