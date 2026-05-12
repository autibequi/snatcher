-- Adiciona colunas canônicas à tabela groups existente (whatsapp_jid, category_id, timezone, daily_msg_cap)
ALTER TABLE groups
    ADD COLUMN IF NOT EXISTS whatsapp_jid TEXT,
    ADD COLUMN IF NOT EXISTS category_id  BIGINT REFERENCES categories(id),
    ADD COLUMN IF NOT EXISTS timezone     TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    ADD COLUMN IF NOT EXISTS daily_msg_cap INT NOT NULL DEFAULT 30;
