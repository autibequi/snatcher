CREATE TABLE IF NOT EXISTS group_conversion_features (
    group_id        BIGINT NOT NULL REFERENCES groups(id),
    feature_key     TEXT NOT NULL,
    feature_value   JSONB NOT NULL,
    conversion_lift NUMERIC(4,2) NOT NULL,
    samples         INT NOT NULL DEFAULT 0,
    confidence      NUMERIC(3,2) NOT NULL,
    discovered_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_validated  TIMESTAMPTZ,
    status          TEXT NOT NULL DEFAULT 'active',
    PRIMARY KEY (group_id, feature_key, feature_value)
);
CREATE INDEX IF NOT EXISTS idx_gcf_active ON group_conversion_features (group_id, conversion_lift DESC)
    WHERE status = 'active';
