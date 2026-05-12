-- Tabela de eventos de click de shortlinks (novo sistema, sem FK para product legado)
CREATE TABLE IF NOT EXISTS shortlink_clicks (
    id          BIGSERIAL PRIMARY KEY,
    short_id    TEXT NOT NULL,
    source      TEXT NOT NULL DEFAULT '',
    dest_url    TEXT NOT NULL DEFAULT '',
    -- contexto do dispatch que gerou o click (resolvido via dispatches/auto_match_logs):
    product_id  BIGINT,                          -- catalogproduct.id (nullable se não resolvido)
    channel_id  BIGINT,                          -- channel.id (nullable)
    dispatch_id BIGINT,                          -- dispatch.id (nullable)
    clicked_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    ip_hash     TEXT NOT NULL DEFAULT '',
    user_agent  TEXT NOT NULL DEFAULT '',
    referrer    TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_shortlink_clicks_clicked_at ON shortlink_clicks(clicked_at);
CREATE INDEX IF NOT EXISTS idx_shortlink_clicks_short_id ON shortlink_clicks(short_id);
CREATE INDEX IF NOT EXISTS idx_shortlink_clicks_product_id ON shortlink_clicks(product_id);
CREATE INDEX IF NOT EXISTS idx_shortlink_clicks_channel_id ON shortlink_clicks(channel_id);
