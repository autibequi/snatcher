-- migrate:up
-- Remove keywords excessivamente genéricos que causam falsos positivos
-- (ex: "g pro" matchando "g Proteina", "mx " matchando "MX Titanium",
-- "i3"/"i5"/"i7"/"i9" matchando dosagens, "rx " matchando qualquer texto).

UPDATE taxonomy SET keywords = ARRAY['logitech']
WHERE type = 'brand' AND slug = 'logitech';

UPDATE taxonomy SET keywords = ARRAY['amd', 'ryzen', 'radeon']
WHERE type = 'brand' AND slug = 'amd';

UPDATE taxonomy SET keywords = ARRAY['intel', 'core i3', 'core i5', 'core i7', 'core i9']
WHERE type = 'brand' AND slug = 'intel';

-- Remove duplicação de "Suplementos"/"suplementos" nos produtos existentes,
-- normalizando para a versão capitalizada (Title Case da taxonomia).
UPDATE catalogproduct
SET tags = (
  SELECT to_jsonb(array_agg(DISTINCT t))
  FROM (
    SELECT CASE WHEN lower(elem) IN ('suplementos','suplemento')
                THEN 'Suplementos'
                ELSE elem END AS t
    FROM jsonb_array_elements_text(tags) elem
  ) sub
)
WHERE tags::text ILIKE '%suplemento%';

-- migrate:down
-- noop: não restauramos keywords problemáticos
