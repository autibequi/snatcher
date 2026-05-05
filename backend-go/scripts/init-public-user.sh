#!/usr/bin/env bash
# Cria/atualiza o user 'snatcher_public_app' da role snatcher_public_ro
# Roda no boot do cmd/server (não cmd/public, que é read-only).
# Pré-requisito: migration 0088_public_readonly_role.sql já aplicada.
set -euo pipefail
: "${PUBLIC_DATABASE_PASSWORD:?PUBLIC_DATABASE_PASSWORD obrigatório}"
psql "${DATABASE_URL}" <<SQL
DO \$\$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'snatcher_public_app') THEN
        CREATE USER snatcher_public_app WITH PASSWORD '${PUBLIC_DATABASE_PASSWORD}';
    ELSE
        ALTER USER snatcher_public_app WITH PASSWORD '${PUBLIC_DATABASE_PASSWORD}';
    END IF;
END\$\$;
GRANT snatcher_public_ro TO snatcher_public_app;
SQL
