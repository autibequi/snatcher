-- bandit_arms: estado do Thompson Sampling Bernoulli por (group, category).
-- alpha cresce com conversões (recompensa positiva); beta com envios sem
-- conversão. Warm-start via learned_weights (ctr_30d * samples).
CREATE TABLE IF NOT EXISTS bandit_arms (
    group_id    BIGINT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    category_id BIGINT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    alpha       DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    beta        DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    -- cursor de processamento — só agrega send_log/conversions mais novos que isso
    processed_up_to TIMESTAMPTZ NOT NULL DEFAULT '1970-01-01'::timestamptz,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (group_id, category_id)
);

CREATE INDEX IF NOT EXISTS idx_bandit_arms_group ON bandit_arms (group_id);

-- Warm-start: cria braços para todos (group, category) que já têm learned_weights.
-- alpha = max(1, ctr * samples), beta = max(1, (1-ctr) * samples).
INSERT INTO bandit_arms (group_id, category_id, alpha, beta, processed_up_to)
SELECT group_id, category_id,
       GREATEST(1.0, COALESCE(ctr_30d, 0) * COALESCE(samples_30d, 0)),
       GREATEST(1.0, (1.0 - COALESCE(ctr_30d, 0)) * COALESCE(samples_30d, 0)),
       now()
FROM (
    SELECT group_id, category_id,
           AVG(ctr_30d)::numeric    AS ctr_30d,
           SUM(samples_30d)::numeric AS samples_30d
    FROM learned_weights
    WHERE category_id IS NOT NULL
    GROUP BY group_id, category_id
) lw
ON CONFLICT (group_id, category_id) DO NOTHING;
