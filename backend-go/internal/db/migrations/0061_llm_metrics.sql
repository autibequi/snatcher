-- migrate:up
CREATE TABLE IF NOT EXISTS llm_metrics (
  id BIGSERIAL PRIMARY KEY,
  operation TEXT NOT NULL,
  model TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'ok',
  tokens_in INT NOT NULL DEFAULT 0,
  tokens_out INT NOT NULL DEFAULT 0,
  estimated_cost_usd NUMERIC(10, 6) NOT NULL DEFAULT 0,
  cache_hit BOOLEAN NOT NULL DEFAULT false,
  error BOOLEAN NOT NULL DEFAULT false,
  error_msg TEXT,
  latency_seconds NUMERIC(10, 4),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_llm_metrics_operation_created
  ON llm_metrics(operation, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_llm_metrics_created
  ON llm_metrics(created_at DESC);

-- migrate:down
-- noop
