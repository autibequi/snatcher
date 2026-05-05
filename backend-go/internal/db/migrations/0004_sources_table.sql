-- migrate:up

-- Create sources table for plugin architecture
CREATE TABLE IF NOT EXISTS sources (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('ecommerce', 'cdkey')),
    enabled BOOLEAN NOT NULL DEFAULT true,
    config_json TEXT
);

-- Seed with initial marketplace sources
INSERT INTO sources (id, name, category, enabled) VALUES
    ('ml',  'Mercado Livre', 'ecommerce', true),
    ('amz', 'Amazon',        'ecommerce', true)
ON CONFLICT DO NOTHING;

-- migrate:down
-- noop
