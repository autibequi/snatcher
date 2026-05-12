-- Cria tabela learned_weights com PK composta (grupo × categoria × source) para aprendizado do Algo
CREATE TABLE IF NOT EXISTS learned_weights (
    group_id    BIGINT REFERENCES groups(id) ON DELETE CASCADE,
    category_id BIGINT REFERENCES categories(id),
    source_id   BIGINT REFERENCES sources(id),
    ctr_30d     NUMERIC(5,4),        -- cliques / envios em 30d
    epc_30d     NUMERIC(10,4),       -- earnings per click (quando tiver conversão)
    samples_30d INT,                 -- envios que contribuíram
    confidence  NUMERIC(3,2),        -- 0..1 — confia mais conforme samples cresce
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (group_id, category_id, source_id)
);
