-- Agregação channel-level de learned_weights. Permite "shrinkage hierárquico":
-- grupos com sinal raso (baixa confidence) emprestam estatísticas do canal-mãe.

CREATE TABLE IF NOT EXISTS learned_weights_channel (
    channel_id  BIGINT NOT NULL REFERENCES channels_v2(id) ON DELETE CASCADE,
    category_id BIGINT NOT NULL REFERENCES categories(id),
    source_id   TEXT   NOT NULL REFERENCES sources(id),
    ctr_30d     NUMERIC(5,4),
    epc_30d     NUMERIC(10,4),
    samples_30d INT,
    confidence  NUMERIC(3,2),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (channel_id, category_id, source_id)
);

CREATE INDEX IF NOT EXISTS idx_learned_weights_channel_lookup
    ON learned_weights_channel (channel_id, category_id, source_id);
