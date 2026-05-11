-- 0133: torna o rate-limit por grupo configurável (antes hardcoded a 3 no scheduler).
-- Default 3 preserva comportamento.
ALTER TABLE app_config
    ADD COLUMN IF NOT EXISTS dispatch_max_per_group_per_hour INTEGER NOT NULL DEFAULT 3;
