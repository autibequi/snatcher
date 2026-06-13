-- Reverte o rename. A tabela `jobs` canônica órfã (dead code) NÃO é recriada.
ALTER TABLE jobs RENAME TO background_jobs;
ALTER INDEX IF EXISTS idx_jobs_started RENAME TO idx_background_jobs_started;
ALTER INDEX IF EXISTS idx_jobs_status_started RENAME TO idx_background_jobs_status_started;
ALTER INDEX IF EXISTS idx_jobs_name_running RENAME TO idx_background_jobs_name_running;
