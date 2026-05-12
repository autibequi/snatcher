-- Remove seeds de atributos
DELETE FROM taxonomy WHERE type IN ('weight', 'flavor', 'color', 'size', 'quantity');
ALTER TABLE taxonomy DROP CONSTRAINT IF EXISTS taxonomy_type_check;
ALTER TABLE taxonomy ADD CONSTRAINT taxonomy_type_check CHECK (type IN ('category', 'brand'));
