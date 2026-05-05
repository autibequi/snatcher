-- migrate:up
-- Seed Shopee and Magazine Luiza sources in sources table
INSERT INTO sources (id, name, category, enabled) VALUES
    ('shopee', 'Shopee BR',      'ecommerce', true),
    ('magalu', 'Magazine Luiza', 'ecommerce', true)
ON CONFLICT DO NOTHING;

-- migrate:down
-- noop
