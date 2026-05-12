-- F09: Drop tabelas v1 — catalogproduct, catalogvariant, channel, channelrule,
--      channel_automations, channel_target_accounts, auto_match_logs
--
-- Pre-requisitos:
--   F03: dados de catalogvariant migrados para catalog via fold_catalog
--   F05: handlers v1 removidos (sem leituras dessas tabelas)
--   F08: waaccount migrado para accounts v2
--   F00: pg_dump executado no host antes de rodar este migrate up
--
-- Nota CASCADE: DROP TABLE ... CASCADE remove constraints FK em tabelas dependentes
-- (groups.channel_id_fkey, dispatches.product_id_fkey, etc.) sem dropar as tabelas.
-- groups e dispatches permanecem; suas FKs para channel/catalogproduct são removidas.

BEGIN;

-- ── Analítico v1 ────────────────────────────────────────────────────────────
-- Dados preservados no pg_dump do F00 se necessário.
DROP TABLE IF EXISTS auto_match_logs CASCADE;

-- ── Channel hierarchy v1 ────────────────────────────────────────────────────
-- Ordem: filhos antes de pais (embora CASCADE cuide das FKs, é mais explícito).
DROP TABLE IF EXISTS channel_automations CASCADE;
DROP TABLE IF EXISTS channel_target_accounts CASCADE;
DROP TABLE IF EXISTS channeltarget CASCADE;
DROP TABLE IF EXISTS channelrule CASCADE;
DROP TABLE IF EXISTS channel CASCADE;

-- ── Catalog v1 ──────────────────────────────────────────────────────────────
-- catalogproduct_taxonomy antes de catalogproduct (FK ON DELETE CASCADE, mas explícito).
-- catalogvariant antes de catalogproduct (FK catalog_product_id ON DELETE CASCADE).
-- pricehistory antes de catalogproduct indiretamente via product — mas pricehistory
-- referencia product(id), não catalogproduct; inclusa aqui pois é legado v1.
DROP TABLE IF EXISTS catalogproduct_taxonomy CASCADE;
DROP TABLE IF EXISTS catalogvariant CASCADE;
DROP TABLE IF EXISTS catalogproduct CASCADE;
DROP TABLE IF EXISTS pricehistory CASCADE;

COMMIT;
