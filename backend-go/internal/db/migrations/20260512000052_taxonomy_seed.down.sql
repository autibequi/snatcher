DROP TABLE IF EXISTS catalogproduct_taxonomy;
DROP TABLE IF EXISTS taxonomy_pattern;
ALTER TABLE catalogproduct DROP COLUMN IF EXISTS attributes;
DELETE FROM taxonomy WHERE type IN ('voltage', 'capacity');
ALTER TABLE taxonomy DROP CONSTRAINT IF EXISTS taxonomy_type_check;
ALTER TABLE taxonomy ADD CONSTRAINT taxonomy_type_check
    CHECK (type IN ('category', 'brand', 'weight', 'flavor', 'color', 'size', 'quantity'));
