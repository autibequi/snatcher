-- Backfill catalog_status nas rows existentes onde catalog_status IS NULL.
-- Deve ser executado APÓS o dual-write estar deployado (20260604100000).
-- Para tabelas > 100k rows, executar via job dedicado em batches de id ranges.
-- Filtro WHERE catalog_status IS NULL é idempotente (re-run seguro).
UPDATE catalog SET catalog_status = CASE
    WHEN send_ready = true AND quality_score >= 0.5 THEN 'ready'::catalog_status_t
    WHEN send_ready = true                          THEN 'enriching'::catalog_status_t
    WHEN send_ready = false                         THEN 'pending'::catalog_status_t
    ELSE                                                 'pending'::catalog_status_t
END
WHERE catalog_status IS NULL;
