-- Cria role read-only para cmd/public (shortlinks, public site)
-- O user da role é criado fora da migration via env (POSTGRES_PUBLIC_PASSWORD)
-- pra não vazar senha pro repo.

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'snatcher_public_ro') THEN
        CREATE ROLE snatcher_public_ro;
    END IF;
END$$;

GRANT CONNECT ON DATABASE snatcher TO snatcher_public_ro;
GRANT USAGE ON SCHEMA public TO snatcher_public_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO snatcher_public_ro;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO snatcher_public_ro;
