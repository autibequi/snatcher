-- Cria tabela redirect_domains para diversificação de domínios de redirecionamento
CREATE TABLE IF NOT EXISTS redirect_domains (
    id               BIGSERIAL PRIMARY KEY,
    host             TEXT UNIQUE NOT NULL,
    modem_id         BIGINT REFERENCES modems(id),  -- afinidade; NULL = pool comum
    enabled          BOOLEAN NOT NULL DEFAULT true,
    quarantine_until TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO redirect_domains (host, enabled) VALUES
    ('jon.promo', true)
ON CONFLICT DO NOTHING;
