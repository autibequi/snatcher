-- Cria tabela component_heartbeat para observabilidade de componentes (Algo, Senders, Crawlers)
CREATE TABLE IF NOT EXISTS component_heartbeat (
    name      TEXT PRIMARY KEY,          -- 'algo', 'sender_modem_1', 'crawler_amazon', ...
    last_beat TIMESTAMPTZ NOT NULL DEFAULT now(),
    metadata  JSONB DEFAULT '{}'
);
