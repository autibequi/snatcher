-- Bandit Sampling no nível canal — para warm-start hierárquico de arms
-- novos de grupo. Quando um (group, category) ainda não existe ou tem α/β
-- baixos, herda do canal-mãe pra convergir mais rápido.

CREATE TABLE IF NOT EXISTS bandit_arms_channel (
    channel_id  BIGINT NOT NULL REFERENCES channels_v2(id) ON DELETE CASCADE,
    category_id BIGINT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    alpha       DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    beta        DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    cursor_conversions TIMESTAMPTZ NOT NULL DEFAULT now() - INTERVAL '24 hours',
    cursor_clicks      TIMESTAMPTZ NOT NULL DEFAULT now() - INTERVAL '24 hours',
    cursor_losses      TIMESTAMPTZ NOT NULL DEFAULT now() - INTERVAL '24 hours',
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (channel_id, category_id)
);

CREATE INDEX IF NOT EXISTS idx_bandit_arms_channel_lookup
    ON bandit_arms_channel (channel_id);

-- Warm-start a partir do learned_weights_channel se já houver dados.
INSERT INTO bandit_arms_channel (channel_id, category_id, alpha, beta, cursor_conversions, cursor_clicks, cursor_losses)
SELECT channel_id, category_id,
       GREATEST(1.0, ctr_30d * samples_30d),
       GREATEST(1.0, (1.0 - ctr_30d) * samples_30d),
       now() - INTERVAL '24 hours',
       now() - INTERVAL '24 hours',
       now() - INTERVAL '24 hours'
FROM learned_weights_channel
WHERE category_id IS NOT NULL
ON CONFLICT DO NOTHING;
