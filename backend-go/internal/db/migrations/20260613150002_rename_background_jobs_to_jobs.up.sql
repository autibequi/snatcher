-- W5 refactor 2026-06 (D8): conclui a transição Q10 que ficou pela metade.
-- A tabela `jobs` canônica (20260513100014) nunca foi consumida pelo código — a fila viva
-- é `background_jobs` (job_persistence.go, jobs/persistence.go, handlers/admin/{jobs,work_queue}.go).
-- Dropa a canônica órfã e renomeia background_jobs → jobs (+ índices). O código já foi
-- atualizado para referenciar `jobs` no mesmo commit.
DROP TABLE IF EXISTS jobs CASCADE;
ALTER TABLE background_jobs RENAME TO jobs;
ALTER INDEX IF EXISTS idx_background_jobs_started RENAME TO idx_jobs_started;
ALTER INDEX IF EXISTS idx_background_jobs_status_started RENAME TO idx_jobs_status_started;
ALTER INDEX IF EXISTS idx_background_jobs_name_running RENAME TO idx_jobs_name_running;
