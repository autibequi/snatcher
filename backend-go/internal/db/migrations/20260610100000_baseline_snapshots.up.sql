-- W-1 Baselining: snapshot-per-run table.
-- Cada entrada representa uma coleta completa do cron (capture-baseline.sh),
-- com payload JSONB contendo métricas agregadas do ciclo: CTR, ban rate,
-- latency p95 e dispatch count.
-- Nota: tabela baseline_snapshots anterior (20260601100000) usa schema EAV
-- (metric_name + value_numeric). Esta usa snapshot_id + payload para fácil
-- congelamento do baseline final (docs/baseline-2026-06.json).
-- Retenção: 90 dias (governada por observability_config.baseline_retention_days).

CREATE TABLE IF NOT EXISTS baseline_snapshots (
  id          BIGSERIAL PRIMARY KEY,
  snapshot_id TEXT NOT NULL UNIQUE,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  payload     JSONB NOT NULL,   -- métricas: CTR, ban rate, latency p95, dispatch count
  wave        TEXT NOT NULL DEFAULT 'W-1',
  notes       TEXT
);
