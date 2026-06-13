-- W3 refactor 2026-06: público-alvo determinístico no canal (substitui bandit/weights).
-- Colunas do target consumidas por internal/services/target.Match e pelo endpoint
-- /api/channels/{id}/target-config. Arrays nativos do Postgres (lib/pq).
ALTER TABLE channels_v2 ADD COLUMN IF NOT EXISTS target_categories bigint[] NOT NULL DEFAULT '{}';
ALTER TABLE channels_v2 ADD COLUMN IF NOT EXISTS price_min numeric NOT NULL DEFAULT 0;
ALTER TABLE channels_v2 ADD COLUMN IF NOT EXISTS price_max numeric NOT NULL DEFAULT 0;
ALTER TABLE channels_v2 ADD COLUMN IF NOT EXISTS blacklist text[] NOT NULL DEFAULT '{}';
ALTER TABLE channels_v2 ADD COLUMN IF NOT EXISTS whitelist text[] NOT NULL DEFAULT '{}';
