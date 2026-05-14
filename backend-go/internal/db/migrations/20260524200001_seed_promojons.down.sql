-- Remove grupos e canais PromoJon seed.
DELETE FROM group_admins WHERE group_id IN (SELECT id FROM groups WHERE name LIKE 'PromoJon%');
DELETE FROM groups WHERE name LIKE 'PromoJon%';
DELETE FROM channel_category_weights WHERE channel_id IN (
    SELECT id FROM channels_v2
    WHERE name IN ('Tech','Gaming','Casa & Deco','Churrasqueiras','Café Gourmet',
                   'Cosméticos','Moda','Tênis & Esporte','Suplementos')
);
DELETE FROM channels_v2
WHERE name IN ('Tech','Gaming','Casa & Deco','Churrasqueiras','Café Gourmet',
               'Cosméticos','Moda','Tênis & Esporte','Suplementos');
DELETE FROM categories WHERE slug IN ('cafe','cosmetico','suplemento','churras');
