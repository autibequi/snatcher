-- Cria tabela llm_autonomy (dead man switch por loop) com 9 seeds canônicos
CREATE TABLE IF NOT EXISTS llm_autonomy (
    loop_name    TEXT PRIMARY KEY,
    status       TEXT NOT NULL DEFAULT 'active',  -- 'active' | 'suggesting' | 'disabled'
    strikes_30d  INT NOT NULL DEFAULT 0,
    last_strike_at TIMESTAMPTZ,
    disabled_until TIMESTAMPTZ,
    notes        TEXT
);

INSERT INTO llm_autonomy (loop_name, status) VALUES
    ('affinity_adjust',  'active'),
    ('template_ab',      'active'),
    ('cooldown_suggest', 'active'),    -- só sugere, não aplica
    ('cap_suggest',      'active'),    -- só sugere, não aplica
    ('taxonomy_grow',    'active'),
    ('anomaly_pause',    'active'),
    ('scraper_fix',      'active'),    -- L7
    ('auto_tuning',      'active'),    -- L8
    ('content_optimize', 'disabled')   -- L9 · habilita após 60d de conversões acumuladas
ON CONFLICT DO NOTHING;
