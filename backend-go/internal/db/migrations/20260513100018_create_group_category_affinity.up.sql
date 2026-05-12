-- Cria tabela group_category_affinity com PK composta (group_id, category_id)
CREATE TABLE IF NOT EXISTS group_category_affinity (
    group_id    BIGINT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    category_id BIGINT NOT NULL REFERENCES categories(id),
    affinity    NUMERIC(3,2) NOT NULL DEFAULT 0.50,
    PRIMARY KEY (group_id, category_id)
);
