-- Cria tabela daily_metrics para agregação histórica que sobrevive a retenção granular
CREATE TABLE IF NOT EXISTS daily_metrics (
    date      DATE NOT NULL,
    metric    TEXT NOT NULL,      -- 'sent', 'clicks', 'conversions', 'bans', 'epc', ...
    dimension JSONB NOT NULL,     -- {group_id, category_id, source_id, modem_id}
    value     NUMERIC(14,4) NOT NULL,
    PRIMARY KEY (date, metric, dimension)
);

CREATE INDEX IF NOT EXISTS idx_daily_metric_date
    ON daily_metrics (metric, date DESC);
