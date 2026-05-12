ALTER TABLE catalogproduct ADD COLUMN IF NOT EXISTS quantity TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS ix_catalogproduct_quantity ON catalogproduct(quantity) WHERE quantity != '';
