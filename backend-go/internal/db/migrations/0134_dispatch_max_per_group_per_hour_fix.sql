-- 0134: corrige 0133 que usou nome de tabela errado (app_config em vez de appconfig).
-- Em instalações limpas, 0133 já cria a coluna corretamente; IF NOT EXISTS é idempotente.
ALTER TABLE appconfig
    ADD COLUMN IF NOT EXISTS dispatch_max_per_group_per_hour INTEGER NOT NULL DEFAULT 3;
