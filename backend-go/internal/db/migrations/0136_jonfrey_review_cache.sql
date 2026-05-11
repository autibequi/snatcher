-- 0136: cache persistido da revisão Jonfrey · 24h.
--
-- Antes o cache vivia só em memória do processo (TTL 1h) — qualquer restart
-- do backend (deploy, dev, scaler) zerava o cache e a próxima request
-- chamava o LLM de novo. O usuário relatou ver "sempre regenerando".
--
-- Mesma forma da recommendation_cache (0110): tabela single-row id=1, blob
-- JSON com a resposta inteira. Quem lê verifica `cached_at` contra o TTL
-- (24h, mesmo do recommendation). `?force=1` no endpoint continua sendo o
-- bypass manual para regeneração imediata.

-- migrate:up
CREATE TABLE IF NOT EXISTS jonfrey_review_cache (
    id           INT PRIMARY KEY DEFAULT 1,
    headline     TEXT NOT NULL DEFAULT '',
    items        JSONB NOT NULL DEFAULT '[]',
    generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    cached_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO jonfrey_review_cache (id) VALUES (1) ON CONFLICT DO NOTHING;

-- migrate:down
DROP TABLE IF EXISTS jonfrey_review_cache;
