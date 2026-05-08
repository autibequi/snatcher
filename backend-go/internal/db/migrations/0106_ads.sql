-- migrate:up
-- Anúncios: disparos recorrentes customizados (texto + imagem) com schedule e janela ativa.
-- Diferente de dispatch (one-shot): ad é uma campanha que se repete dentro de active_until.
CREATE TABLE IF NOT EXISTS ads (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  message_text TEXT NOT NULL,
  image_url TEXT,
  channel_ids BIGINT[] NOT NULL DEFAULT '{}',  -- canais alvo
  group_ids BIGINT[] NOT NULL DEFAULT '{}',     -- grupos específicos (alternativa a channel_ids)
  schedule_cron TEXT NOT NULL DEFAULT '0 12 * * *', -- crontab; default = diário 12h
  active_until TIMESTAMPTZ,                     -- até quando o anúncio fica ativo (NULL = sem limite)
  enabled BOOLEAN NOT NULL DEFAULT true,
  last_dispatched_at TIMESTAMPTZ,
  dispatch_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ads_active ON ads(enabled, active_until);

-- migrate:down
DROP TABLE IF EXISTS ads;
