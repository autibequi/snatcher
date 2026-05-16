-- Reverte o backfill: apaga catalog_status de todas as rows.
-- ATENÇÃO: isso não é seguro em produção sem dual-write ainda ativo.
UPDATE catalog SET catalog_status = NULL;
