-- Backfill short_id para produtos legacy sem short_id
-- Usa encode(gen_random_bytes(4), 'hex') como short_id temporário (8 chars hex)
-- O backend pode regenerar com formato base62 se necessário
UPDATE product
SET short_id = substring(md5(random()::text || clock_timestamp()::text), 1, 8)
WHERE short_id IS NULL OR short_id = '';
