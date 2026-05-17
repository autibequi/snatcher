-- Remove o índice e coluna shadow_mode criados em 20260612100001.
DROP INDEX IF EXISTS idx_modem_routing_shadow;
ALTER TABLE modem_routing DROP COLUMN IF EXISTS shadow_mode;
