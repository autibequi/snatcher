-- Fila de trabalhos genérica (pipeline, Jonfrey batch, curation, etc.) — persiste estado para sobreviver a restart.
CREATE TABLE IF NOT EXISTS background_jobs (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL DEFAULT 'task',
  name TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  progress INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  done INTEGER NOT NULL DEFAULT 0,
  message TEXT,
  error_message TEXT,
  activity_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_background_jobs_started ON background_jobs(started_at ASC);
CREATE INDEX IF NOT EXISTS idx_background_jobs_status_started ON background_jobs(status, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_background_jobs_name_running ON background_jobs(name) WHERE status = 'running';
