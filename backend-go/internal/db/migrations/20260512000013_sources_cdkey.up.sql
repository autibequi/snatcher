-- Seed Humble Bundle and Kinguin sources in sources table
INSERT INTO sources (id, name, category, enabled) VALUES
    ('humble',  'Humble Bundle', 'cdkey', true),
    ('kinguin', 'Kinguin',       'cdkey', true)
ON CONFLICT DO NOTHING;
