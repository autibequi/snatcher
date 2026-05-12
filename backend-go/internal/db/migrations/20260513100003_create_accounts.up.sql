-- Cria tabela accounts (contas WhatsApp com afinidade fixa a modem e status canônico)
CREATE TABLE IF NOT EXISTS accounts (
    id                   BIGSERIAL PRIMARY KEY,
    phone                TEXT UNIQUE NOT NULL,
    modem_id             BIGINT NOT NULL REFERENCES modems(id),  -- afinidade fixa
    status               TEXT NOT NULL DEFAULT 'warming',
    -- 'warming' | 'backup' | 'primary' | 'quarantine' | 'banned'
    status_changed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    daily_send_quota     INT NOT NULL DEFAULT 20,
    last_sent_at         TIMESTAMPTZ,
    consecutive_failures INT NOT NULL DEFAULT 0,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_accounts_modem ON accounts (modem_id, status);
