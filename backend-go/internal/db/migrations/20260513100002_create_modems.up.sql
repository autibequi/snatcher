-- Cria tabela modems com 3 seeds de modems USB ativos
CREATE TABLE IF NOT EXISTS modems (
    id             BIGSERIAL PRIMARY KEY,
    slug           TEXT UNIQUE NOT NULL,
    interface_name TEXT NOT NULL,                          -- 'usb0', 'ppp0'
    public_ip      INET,
    status         TEXT NOT NULL DEFAULT 'active',         -- 'active' | 'paused' | 'quarantine'
    paused_until   TIMESTAMPTZ,
    paused_reason  TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO modems (slug, interface_name, status) VALUES
    ('modem-01', 'usb0', 'active'),
    ('modem-02', 'usb1', 'active'),
    ('modem-03', 'usb2', 'active')
ON CONFLICT DO NOTHING;
