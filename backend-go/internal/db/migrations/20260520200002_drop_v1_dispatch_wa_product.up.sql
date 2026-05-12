-- F10: Drop tabelas v1 — dispatches, dispatch_targets, waaccount, product,
--      tgaccount, telegramchat, clicklog, ads, broadcastmessage
--
-- Pre-requisitos:
--   F07: redirect→dispatches JOIN migrado para send_log v2
--   F08: waaccount migrado para accounts v2
--   F09: catalogproduct/channel/auto_match_logs dropados
--   F00: pg_dump executado no host antes de rodar este migrate up
--
-- Nota CASCADE: DROP TABLE ... CASCADE remove constraints FK em tabelas dependentes
-- sem dropar as tabelas dependentes. Ex: groups.wa_account_id_fkey removida sem
-- dropar groups; group_spies.reader_wa_id_fkey removida sem dropar group_spies.
--
-- short_links NÃO dropada aqui — compartilhada com /api/links/shorten v2.

BEGIN;

-- ── Dispatch hierarchy v1 ───────────────────────────────────────────────────
-- dispatch_targets antes de dispatches (FK dispatch_id ON DELETE CASCADE).
DROP TABLE IF EXISTS dispatch_targets CASCADE;
DROP TABLE IF EXISTS dispatches CASCADE;

-- ── WhatsApp account v1 ─────────────────────────────────────────────────────
DROP TABLE IF EXISTS waaccount CASCADE;

-- ── Product v1 ──────────────────────────────────────────────────────────────
-- clicklog antes de product (FK product_id ON DELETE CASCADE).
DROP TABLE IF EXISTS clicklog CASCADE;
DROP TABLE IF EXISTS product CASCADE;

-- ── Telegram v1 ─────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS telegramchat CASCADE;
DROP TABLE IF EXISTS tgaccount CASCADE;

-- ── Ads / Broadcast v1 ──────────────────────────────────────────────────────
DROP TABLE IF EXISTS ads CASCADE;
DROP TABLE IF EXISTS broadcastmessage CASCADE;

COMMIT;
