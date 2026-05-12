-- F10 DOWN: recria schemas mínimos das tabelas v1 dropadas
-- AVISO: dados perdidos — restore via pg_dump do F00 se necessário.
-- Colunas reduzidas ao mínimo (id PK) para satisfazer FKs externas que
-- possam existir em outros downs; estrutura completa só via pg_dump.

CREATE TABLE IF NOT EXISTS dispatches (id BIGSERIAL PRIMARY KEY);
CREATE TABLE IF NOT EXISTS dispatch_targets (id BIGSERIAL PRIMARY KEY);
CREATE TABLE IF NOT EXISTS waaccount (id BIGSERIAL PRIMARY KEY);
CREATE TABLE IF NOT EXISTS product (id BIGSERIAL PRIMARY KEY);
CREATE TABLE IF NOT EXISTS tgaccount (id BIGSERIAL PRIMARY KEY);
CREATE TABLE IF NOT EXISTS telegramchat (chat_id TEXT PRIMARY KEY);
CREATE TABLE IF NOT EXISTS clicklog (id BIGSERIAL PRIMARY KEY);
CREATE TABLE IF NOT EXISTS ads (id BIGSERIAL PRIMARY KEY);
CREATE TABLE IF NOT EXISTS broadcastmessage (id BIGSERIAL PRIMARY KEY);
