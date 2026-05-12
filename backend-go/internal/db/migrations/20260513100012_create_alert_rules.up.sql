-- Cria tabela alert_rules (regras editáveis sem deploy) com 5 seeds canônicos de monitoramento
CREATE TABLE IF NOT EXISTS alert_rules (
    id            BIGSERIAL PRIMARY KEY,
    name          TEXT UNIQUE NOT NULL,
    query         TEXT NOT NULL,          -- SQL que retorna linhas problemáticas
    severity      TEXT NOT NULL,          -- 'critical' | 'warning'
    cooldown_min  INT NOT NULL DEFAULT 60,
    enabled       BOOLEAN NOT NULL DEFAULT true,
    last_fired_at TIMESTAMPTZ
);

INSERT INTO alert_rules (name, query, severity, cooldown_min) VALUES
    (
        'ban_rate_24h',
        'SELECT modem_id, COUNT(*) AS ban_count
         FROM ban_events
         WHERE detected_at > now() - INTERVAL ''24h''
         GROUP BY modem_id
         HAVING COUNT(*) >= 2',
        'critical',
        60
    ),
    (
        'scraper_drift_30pct',
        'SELECT source_id, field, success_rate
         FROM scraper_configs
         WHERE status = ''active''
           AND success_rate IS NOT NULL
           AND success_rate < 0.70',
        'warning',
        120
    ),
    (
        'group_decay_50pct',
        'SELECT lw.group_id, lw.category_id, lw.ctr_30d
         FROM learned_weights lw
         WHERE lw.ctr_30d IS NOT NULL
           AND lw.ctr_30d < 0.01
           AND lw.samples_30d > 10',
        'warning',
        240
    ),
    (
        'sender_heartbeat_stale',
        'SELECT name, last_beat
         FROM component_heartbeat
         WHERE name LIKE ''sender_%''
           AND last_beat < now() - INTERVAL ''10 minutes''',
        'critical',
        30
    ),
    (
        'llm_loop_strikes_high',
        'SELECT loop_name, strikes_30d
         FROM llm_autonomy
         WHERE strikes_30d >= 3
           AND status = ''active''',
        'warning',
        180
    )
ON CONFLICT DO NOTHING;
