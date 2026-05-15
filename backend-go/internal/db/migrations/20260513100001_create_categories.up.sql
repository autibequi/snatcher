-- Cria tabela categories com 5 seeds canônicos de categorias de produto
CREATE TABLE IF NOT EXISTS categories (
    id           BIGSERIAL PRIMARY KEY,
    slug         TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    weight       NUMERIC(4,2) NOT NULL DEFAULT 1.0
);

INSERT INTO categories (slug, display_name, weight) VALUES
    ('eletronico', 'Eletrônicos', 1.20),
    ('gaming',     'Gaming',      1.15),
    ('casa',       'Casa',        1.00),
    ('moda',       'Moda',        0.95)
ON CONFLICT DO NOTHING;
