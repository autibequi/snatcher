-- migrate:up
CREATE TABLE IF NOT EXISTS llm_op_budgets (
  operation TEXT PRIMARY KEY,
  daily_usd_limit NUMERIC(10,4) NOT NULL,
  daily_spent_usd NUMERIC(10,4) NOT NULL DEFAULT 0,
  rate_limit_per_minute INT NOT NULL DEFAULT 60,
  enabled BOOLEAN NOT NULL DEFAULT true,
  last_reset_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO llm_op_budgets (operation, daily_usd_limit, rate_limit_per_minute) VALUES
  ('compose', 5.00, 30),
  ('parse_offer', 3.00, 60),
  ('cluster_label', 1.00, 10),
  ('rephrase_reasons', 0.50, 30)
ON CONFLICT DO NOTHING;

-- migrate:down
-- noop
