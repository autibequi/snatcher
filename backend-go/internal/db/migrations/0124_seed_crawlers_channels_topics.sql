-- migrate:up
-- Seeds idempotentes: crawlers (searchterm) + canais com audience/tópicos.
-- Espelha internal/store/crawler_channel_seed.sql (manter alinhado).

INSERT INTO channel (name, description, slug, send_start_hour, send_end_hour, digest_mode, digest_max_items, active, audience)
SELECT 'Ofertas Tech', 'Canal seed — eletrônicos, informática e periféricos.', 'seed-ofertas-tech', 8, 22, false, 5, true, '{"categories":["Eletrônicos","Informática","Periféricos"],"brands":["Samsung","LG","Logitech"],"age_range":[18,55],"gender":"mix","min_drop":5,"min_price":0,"max_price":120000,"locales":["BR"],"weights":{"category":0.35,"brand":0.2,"drop":0.2,"price":0.15,"history":0.1}}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM channel WHERE slug = 'seed-ofertas-tech');

INSERT INTO channel (name, description, slug, send_start_hour, send_end_hour, digest_mode, digest_max_items, active, audience)
SELECT 'Casa & Conforto', 'Canal seed — eletrodomésticos, móveis e utilidades.', 'seed-casa-conforto', 8, 22, false, 5, true, '{"categories":["Eletrodomésticos","Móveis","Utilidades Domésticas"],"brands":["Brastemp","Electrolux","Philco"],"age_range":[25,65],"gender":"mix","min_drop":3,"min_price":0,"max_price":90000,"locales":["BR"],"weights":{"category":0.32,"brand":0.18,"drop":0.22,"price":0.18,"history":0.1}}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM channel WHERE slug = 'seed-casa-conforto');

INSERT INTO channel (name, description, slug, send_start_hour, send_end_hour, digest_mode, digest_max_items, active, audience)
SELECT 'Moda & Estilo', 'Canal seed — vestuário, calçados e acessórios.', 'seed-moda-style', 9, 21, false, 6, true, '{"categories":["Moda","Calçados","Acessórios"],"brands":["Nike","Adidas","Zara"],"age_range":[16,45],"gender":"mix","min_drop":8,"min_price":0,"max_price":35000,"locales":["BR"],"weights":{"category":0.28,"brand":0.25,"drop":0.22,"price":0.15,"history":0.1}}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM channel WHERE slug = 'seed-moda-style');

INSERT INTO channel (name, description, slug, send_start_hour, send_end_hour, digest_mode, digest_max_items, active, audience)
SELECT 'Games & Keys', 'Canal seed — jogos digitais e keys (audiência cdkey).', 'seed-games-keys', 10, 23, true, 8, true, '{"categories":["Games","Gift Cards","Software"],"brands":["Steam","PlayStation","Xbox"],"age_range":[16,40],"gender":"mix","min_drop":2,"min_price":0,"max_price":25000,"locales":["BR"],"weights":{"category":0.25,"brand":0.25,"drop":0.2,"price":0.15,"history":0.15}}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM channel WHERE slug = 'seed-games-keys');

INSERT INTO searchterm (query, queries, min_val, max_val, sources, category, active, crawl_interval)
SELECT 'notebook gamer', '["notebook gaming","notebook para jogos"]'::jsonb, 0, 85000, '["ml","amz"]', 'ecommerce', true, 45
WHERE NOT EXISTS (SELECT 1 FROM searchterm WHERE query = 'notebook gamer');

INSERT INTO searchterm (query, queries, min_val, max_val, sources, category, active, crawl_interval)
SELECT 'smartphone samsung', '["galaxy celular","smartphone android"]'::jsonb, 0, 60000, '["ml","amz"]', 'ecommerce', true, 50
WHERE NOT EXISTS (SELECT 1 FROM searchterm WHERE query = 'smartphone samsung');

INSERT INTO searchterm (query, queries, min_val, max_val, sources, category, active, crawl_interval)
SELECT 'geladeira frost free', '["refrigerador duplex","geladeira inverter"]'::jsonb, 0, 120000, '["ml","amz"]', 'ecommerce', true, 90
WHERE NOT EXISTS (SELECT 1 FROM searchterm WHERE query = 'geladeira frost free');

INSERT INTO searchterm (query, queries, min_val, max_val, sources, category, active, crawl_interval)
SELECT 'monitor 27 4k', '["monitor ultrawide","monitor gamer 27"]'::jsonb, 0, 70000, '["ml","amz"]', 'ecommerce', true, 60
WHERE NOT EXISTS (SELECT 1 FROM searchterm WHERE query = 'monitor 27 4k');

INSERT INTO searchterm (query, queries, min_val, max_val, sources, category, active, crawl_interval)
SELECT 'aspirador robô', '["robô aspirador","aspirador inteligente"]'::jsonb, 0, 15000, '["ml","amz"]', 'ecommerce', true, 75
WHERE NOT EXISTS (SELECT 1 FROM searchterm WHERE query = 'aspirador robô');

INSERT INTO searchterm (query, queries, min_val, max_val, sources, category, active, crawl_interval)
SELECT 'headset gamer', '["fone gamer","headset com microfone"]'::jsonb, 0, 25000, '["ml","amz"]', 'ecommerce', true, 40
WHERE NOT EXISTS (SELECT 1 FROM searchterm WHERE query = 'headset gamer');

INSERT INTO searchterm (query, queries, min_val, max_val, sources, category, active, crawl_interval)
SELECT 'smart tv 55', '["televisão 55 polegadas","tv 4k 55"]'::jsonb, 0, 80000, '["ml","amz"]', 'ecommerce', true, 55
WHERE NOT EXISTS (SELECT 1 FROM searchterm WHERE query = 'smart tv 55');

INSERT INTO searchterm (query, queries, min_val, max_val, sources, category, active, crawl_interval)
SELECT 'air fryer', '["fritadeira elétrica","airfryer"]'::jsonb, 0, 35000, '["ml","amz"]', 'ecommerce', true, 65
WHERE NOT EXISTS (SELECT 1 FROM searchterm WHERE query = 'air fryer');

INSERT INTO searchterm (query, queries, min_val, max_val, sources, category, active, crawl_interval)
SELECT 'steam deck', '["steam deck oled","valve steam deck"]'::jsonb, 0, 12000, '["humble","kinguin"]', 'cdkey', true, 120
WHERE NOT EXISTS (SELECT 1 FROM searchterm WHERE query = 'steam deck');

INSERT INTO searchterm (query, queries, min_val, max_val, sources, category, active, crawl_interval)
SELECT 'gift card psn', '["playstation store card","psn brasil"]'::jsonb, 0, 8000, '["humble","kinguin"]', 'cdkey', true, 180
WHERE NOT EXISTS (SELECT 1 FROM searchterm WHERE query = 'gift card psn');

-- migrate:down
-- noop (seeds opcionais; não remover dados criados por slug/query fixos)
