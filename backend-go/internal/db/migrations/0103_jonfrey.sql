-- migrate:up
-- Jonfrey: assistente AI que orquestra automações.
-- Tabela de auditoria de cada ação tomada pelo Jonfrey.
CREATE TABLE IF NOT EXISTS jonfrey_actions (
  id BIGSERIAL PRIMARY KEY,
  action_type TEXT NOT NULL,                      -- ex: inspect_pending, expire_stale, suggest_crawler
  target TEXT,                                    -- alvo opcional (ex: channel_id=42)
  status TEXT NOT NULL DEFAULT 'pending',         -- pending | running | success | failed | skipped
  reasoning TEXT,                                 -- explicação do Jonfrey/LLM
  before_snapshot JSONB DEFAULT '{}'::jsonb,      -- estado antes
  after_snapshot JSONB DEFAULT '{}'::jsonb,       -- estado depois
  error_message TEXT,
  triggered_by TEXT NOT NULL DEFAULT 'manual',    -- manual | auto | scheduled
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_jonfrey_actions_created ON jonfrey_actions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jonfrey_actions_type ON jonfrey_actions(action_type, status);

-- Configuração singleton (ID=1 sempre)
CREATE TABLE IF NOT EXISTS jonfrey_config (
  id INTEGER PRIMARY KEY DEFAULT 1,
  enabled BOOLEAN NOT NULL DEFAULT false,
  interval_minutes INTEGER NOT NULL DEFAULT 60,
  enabled_actions TEXT[] DEFAULT ARRAY['dispatch_auto_match','expire_stale_dispatches','inspect_pending_products']::TEXT[],
  last_run_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (id = 1)
);

INSERT INTO jonfrey_config (id) VALUES (1) ON CONFLICT DO NOTHING;

-- migrate:down
DROP TABLE IF EXISTS jonfrey_actions;
DROP TABLE IF EXISTS jonfrey_config;
