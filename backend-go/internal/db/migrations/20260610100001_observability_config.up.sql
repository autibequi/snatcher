-- W-1 Observabilidade: configuração da bridge Prometheus + OTel.
-- Tabela key-value com seed de 3 entradas de configuração.
-- Editável pelo admin sem deploy — altera comportamento do exporter em runtime.

CREATE TABLE IF NOT EXISTS observability_config (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  notes TEXT
);

INSERT INTO observability_config (key, value, notes) VALUES
  ('prometheus_enabled', 'true', 'Prometheus scrape endpoint /metrics'),
  ('otel_endpoint', '', 'OTLP gRPC endpoint; vazio = desabilitado'),
  ('baseline_retention_days', '90', 'Retenção de snapshots baseline em dias')
ON CONFLICT (key) DO NOTHING;
