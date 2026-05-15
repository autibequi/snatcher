-- Adiciona coluna brand ao catálogo
ALTER TABLE catalog ADD COLUMN IF NOT EXISTS brand TEXT;
CREATE INDEX IF NOT EXISTS idx_catalog_brand ON catalog(brand) WHERE brand IS NOT NULL;
